import { createFungibleToken, mintTokens, transferTokens } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";

import { getReputationStore, persistReputationStore, type ReputationStore } from "./store.js";
import { ReputationError, type RepTokenConfig } from "./types.js";

interface TokenDependencies {
  createFungibleToken: typeof createFungibleToken;
  mintTokens: typeof mintTokens;
  transferTokens: typeof transferTokens;
  now: () => Date;
}

export interface CreateRepTokenInput {
  treasuryAccountId: string;
  name?: string;
  symbol?: string;
  initialSupply?: number;
}

export interface CreateRepTokenOptions {
  client?: Client;
  store?: ReputationStore;
  deps?: Partial<TokenDependencies>;
}

export interface MintRepInput {
  tokenId?: string;
  treasuryAccountId: string;
  recipientAccountId: string;
  amount: number;
}

function validateNonEmptyString(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new ReputationError(`${field} must be a non-empty string.`);
  }
}

function validatePositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ReputationError(`${field} must be a positive integer.`);
  }
}

function toReputationError(message: string, error: unknown): ReputationError {
  if (error instanceof ReputationError) {
    return error;
  }

  return new ReputationError(message, error);
}

export async function createRepToken(
  input: CreateRepTokenInput,
  options: CreateRepTokenOptions = {}
): Promise<RepTokenConfig> {
  validateNonEmptyString(input.treasuryAccountId, "treasuryAccountId");

  const deps: TokenDependencies = {
    createFungibleToken,
    mintTokens,
    transferTokens,
    now: () => new Date(),
    ...options.deps
  };

  const store = getReputationStore(options.store);

  try {
    const token = await deps.createFungibleToken(
      input.name ?? "Simulacrum Reputation",
      input.symbol ?? "REP",
      input.initialSupply ?? 0,
      0,
      {
        client: options.client,
        treasuryAccountId: input.treasuryAccountId,
        memo: "Simulacrum REP token"
      }
    );

    const repToken: RepTokenConfig = {
      tokenId: token.tokenId,
      tokenUrl: token.tokenUrl,
      treasuryAccountId: input.treasuryAccountId,
      createdAt: deps.now().toISOString(),
      transactionId: token.transactionId,
      transactionUrl: token.transactionUrl
    };

    store.repToken = repToken;
    persistReputationStore(store);

    return repToken;
  } catch (error) {
    throw toReputationError("Failed to create REP token.", error);
  }
}

export async function mintAndDistributeRep(
  input: MintRepInput,
  options: CreateRepTokenOptions = {}
): Promise<{
  tokenId: string;
  mintTransactionId: string;
  transferTransactionId: string;
}> {
  validateNonEmptyString(input.treasuryAccountId, "treasuryAccountId");
  validateNonEmptyString(input.recipientAccountId, "recipientAccountId");
  validatePositiveInteger(input.amount, "amount");

  const deps: TokenDependencies = {
    createFungibleToken,
    mintTokens,
    transferTokens,
    now: () => new Date(),
    ...options.deps
  };
  const store = getReputationStore(options.store);
  const tokenId = input.tokenId ?? store.repToken?.tokenId;

  if (!tokenId) {
    throw new ReputationError("REP token is not configured. Create it first or pass tokenId.");
  }

  try {
    const minted = await deps.mintTokens(tokenId, input.amount, {
      client: options.client
    });
    const transferred = await deps.transferTokens(
      tokenId,
      input.treasuryAccountId,
      input.recipientAccountId,
      input.amount,
      {
        client: options.client
      }
    );

    return {
      tokenId,
      mintTransactionId: minted.transactionId,
      transferTransactionId: transferred.transactionId
    };
  } catch (error) {
    throw toReputationError(`Failed to distribute REP for token ${tokenId}.`, error);
  }
}
