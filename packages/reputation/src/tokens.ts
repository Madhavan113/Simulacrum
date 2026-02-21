import { associateToken, createFungibleToken, mintTokens, transferTokens, validateNonEmptyString, validatePositiveInteger } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";

import { getReputationStore, persistReputationStore, type ReputationStore } from "./store.js";
import { ReputationError, type RepTokenConfig } from "./types.js";

interface TokenDependencies {
  associateToken: typeof associateToken;
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
    associateToken,
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
    associateToken,
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
    // HTS requires the recipient to associate with the token before receiving it.
    // Catch TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT so repeat distributions are idempotent.
    try {
      await deps.associateToken(input.recipientAccountId, tokenId, {
        client: options.client
      });
    } catch (assocError: unknown) {
      const alreadyAssociated =
        assocError instanceof Error &&
        assocError.message.includes("TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT");
      if (!alreadyAssociated) {
        throw assocError;
      }
    }

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
