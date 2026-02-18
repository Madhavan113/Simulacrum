import { randomUUID } from "node:crypto";

import { submitMessage, transferHbar, validateNonEmptyString, validatePositiveNumber } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";

import { getMarketStore, persistMarketStore, type MarketStore } from "./store.js";
import { type MarketBet, MarketError, type PlaceBetInput } from "./types.js";

interface PlaceBetDependencies {
  transferHbar: typeof transferHbar;
  submitMessage: typeof submitMessage;
  now: () => Date;
}

export interface PlaceBetOptions {
  client?: Client;
  store?: MarketStore;
  deps?: Partial<PlaceBetDependencies>;
}


function asMarketError(message: string, error: unknown): MarketError {
  if (error instanceof MarketError) {
    return error;
  }

  return new MarketError(message, error);
}

export async function placeBet(
  input: PlaceBetInput,
  options: PlaceBetOptions = {}
): Promise<MarketBet> {
  validateNonEmptyString(input.marketId, "marketId");
  validateNonEmptyString(input.bettorAccountId, "bettorAccountId");
  validateNonEmptyString(input.outcome, "outcome");
  validatePositiveNumber(input.amountHbar, "amountHbar");

  const store = getMarketStore(options.store);
  const market = store.markets.get(input.marketId);

  if (!market) {
    throw new MarketError(`Market ${input.marketId} was not found.`);
  }

  const deps: PlaceBetDependencies = {
    transferHbar,
    submitMessage,
    now: () => new Date(),
    ...options.deps
  };

  const now = deps.now();

  if (now.getTime() > Date.parse(market.closeTime)) {
    market.status = "CLOSED";
    persistMarketStore(store);
  }

  if (market.status !== "OPEN") {
    throw new MarketError(`Market ${input.marketId} is not open for betting.`);
  }

  const normalizedOutcome = input.outcome.trim().toUpperCase();

  if (!market.outcomes.includes(normalizedOutcome)) {
    throw new MarketError(
      `Invalid outcome "${input.outcome}". Supported outcomes: ${market.outcomes.join(", ")}.`
    );
  }

  try {
    const escrowTransfer = await deps.transferHbar(
      input.bettorAccountId,
      market.escrowAccountId,
      input.amountHbar,
      {
        client: options.client
      }
    );

    const audit = await deps.submitMessage(
      market.topicId,
      {
        type: "BET_PLACED",
        marketId: market.id,
        bettorAccountId: input.bettorAccountId,
        outcome: normalizedOutcome,
        amountHbar: input.amountHbar,
        placedAt: now.toISOString()
      },
      { client: options.client }
    );

    const bet: MarketBet = {
      id: randomUUID(),
      marketId: market.id,
      bettorAccountId: input.bettorAccountId,
      outcome: normalizedOutcome,
      amountHbar: input.amountHbar,
      placedAt: now.toISOString(),
      escrowTransactionId: escrowTransfer.transactionId,
      escrowTransactionUrl: escrowTransfer.transactionUrl,
      topicTransactionId: audit.transactionId,
      topicSequenceNumber: audit.sequenceNumber
    };

    const bets = store.bets.get(market.id) ?? [];
    bets.push(bet);
    store.bets.set(market.id, bets);
    persistMarketStore(store);

    return bet;
  } catch (error) {
    throw asMarketError(`Failed to place bet for market ${input.marketId}.`, error);
  }
}
