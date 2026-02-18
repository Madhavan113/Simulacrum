import { randomUUID } from "node:crypto";

import { transferHbar, validateNonEmptyString } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";

import { getMarketStore, persistMarketStore, type MarketStore } from "./store.js";
import { type ClaimRecord, type ClaimWinningsInput, MarketError } from "./types.js";

const TINYBARS_PER_HBAR = 100_000_000n;

interface ClaimDependencies {
  transferHbar: typeof transferHbar;
  now: () => Date;
}

export interface ClaimWinningsOptions {
  client?: Client;
  store?: MarketStore;
  deps?: Partial<ClaimDependencies>;
}

function toTinybars(amountHbar: number): bigint {
  return BigInt(Math.round(amountHbar * Number(TINYBARS_PER_HBAR)));
}

function fromTinybars(tinybars: bigint): number {
  return Number(tinybars) / Number(TINYBARS_PER_HBAR);
}

function asMarketError(message: string, error: unknown): MarketError {
  if (error instanceof MarketError) {
    return error;
  }

  return new MarketError(message, error);
}

export async function claimWinnings(
  input: ClaimWinningsInput,
  options: ClaimWinningsOptions = {}
): Promise<ClaimRecord> {
  validateNonEmptyString(input.marketId, "marketId");
  validateNonEmptyString(input.accountId, "accountId");

  const store = getMarketStore(options.store);
  const market = store.markets.get(input.marketId);

  if (!market) {
    throw new MarketError(`Market ${input.marketId} was not found.`);
  }

  if (market.status !== "RESOLVED" || !market.resolvedOutcome) {
    throw new MarketError(`Market ${input.marketId} is not resolved.`);
  }

  const claimKey = `${input.marketId}:${input.accountId}`;

  if (store.claimIndex.has(claimKey)) {
    throw new MarketError(`Account ${input.accountId} already claimed winnings for ${input.marketId}.`);
  }

  const bets = store.bets.get(input.marketId) ?? [];

  if (bets.length === 0) {
    throw new MarketError(`Market ${input.marketId} has no bets to settle.`);
  }

  let totalPool = 0n;
  let winningPool = 0n;
  let accountWinningStake = 0n;

  for (const bet of bets) {
    const stake = toTinybars(bet.amountHbar);
    totalPool += stake;

    if (bet.outcome === market.resolvedOutcome) {
      winningPool += stake;

      if (bet.bettorAccountId === input.accountId) {
        accountWinningStake += stake;
      }
    }
  }

  if (winningPool <= 0n) {
    throw new MarketError(`Market ${input.marketId} has no winning bets.`);
  }

  if (accountWinningStake <= 0n) {
    throw new MarketError(`Account ${input.accountId} has no winning stake in ${input.marketId}.`);
  }

  const payoutTinybar = (accountWinningStake * totalPool) / winningPool;
  const payoutHbar = fromTinybars(payoutTinybar);

  if (payoutHbar <= 0) {
    throw new MarketError("Calculated payout is zero.");
  }

  const deps: ClaimDependencies = {
    transferHbar,
    now: () => new Date(),
    ...options.deps
  };

  try {
    const destination = input.payoutAccountId ?? input.accountId;
    const transfer = await deps.transferHbar(market.escrowAccountId, destination, payoutHbar, {
      client: options.client
    });

    const claim: ClaimRecord = {
      id: randomUUID(),
      marketId: input.marketId,
      accountId: input.accountId,
      payoutHbar,
      createdAt: deps.now().toISOString(),
      escrowTransactionId: transfer.transactionId,
      escrowTransactionUrl: transfer.transactionUrl
    };

    store.claimIndex.add(claimKey);
    const claims = store.claims.get(input.marketId) ?? [];
    claims.push(claim);
    store.claims.set(input.marketId, claims);
    persistMarketStore(store);

    return claim;
  } catch (error) {
    throw asMarketError(`Failed to claim winnings for market ${input.marketId}.`, error);
  }
}
