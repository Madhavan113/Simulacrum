import { randomUUID } from "node:crypto";

import { transferHbar, validateNonEmptyString, validatePositiveNumber } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";

import { calculatePremium } from "./premiums.js";
import { getInsuranceStore, persistInsuranceStore, type InsuranceStore } from "./store.js";
import { type InsurancePolicy, InsuranceError, type UnderwriteInput } from "./types.js";

interface UnderwriteDependencies {
  transferHbar: typeof transferHbar;
  now: () => Date;
}

export interface UnderwriteOptions {
  client?: Client;
  store?: InsuranceStore;
  deps?: Partial<UnderwriteDependencies>;
}

function toInsuranceError(message: string, error: unknown): InsuranceError {
  if (error instanceof InsuranceError) {
    return error;
  }

  return new InsuranceError(message, error);
}

export async function underwriteCommitment(
  input: UnderwriteInput,
  options: UnderwriteOptions = {}
): Promise<InsurancePolicy> {
  validateNonEmptyString(input.marketId, "marketId");
  validateNonEmptyString(input.underwriterAccountId, "underwriterAccountId");
  validateNonEmptyString(input.beneficiaryAccountId, "beneficiaryAccountId");
  validatePositiveNumber(input.coverageAmountHbar, "coverageAmountHbar");

  const expirationTimestamp = Date.parse(input.expirationTime);

  if (!Number.isFinite(expirationTimestamp)) {
    throw new InsuranceError("expirationTime must be a valid ISO timestamp.");
  }

  const deps: UnderwriteDependencies = {
    transferHbar,
    now: () => new Date(),
    ...options.deps
  };

  const store = getInsuranceStore(options.store);
  const now = deps.now();

  if (expirationTimestamp <= now.getTime()) {
    throw new InsuranceError("expirationTime must be in the future.");
  }

  const premiumAmountHbar =
    (input.coverageAmountHbar * Math.max(1, Math.round(input.premiumRateBps))) / 10_000;

  try {
    const collateralTransfer = await deps.transferHbar(
      input.underwriterAccountId,
      input.escrowAccountId ?? input.underwriterAccountId,
      input.coverageAmountHbar,
      {
        client: options.client
      }
    );

    const policy: InsurancePolicy = {
      id: randomUUID(),
      marketId: input.marketId,
      underwriterAccountId: input.underwriterAccountId,
      beneficiaryAccountId: input.beneficiaryAccountId,
      escrowAccountId: input.escrowAccountId ?? input.underwriterAccountId,
      coverageAmountHbar: input.coverageAmountHbar,
      premiumAmountHbar,
      premiumRateBps: Math.max(1, Math.round(input.premiumRateBps)),
      expirationTime: input.expirationTime,
      createdAt: now.toISOString(),
      status: "ACTIVE",
      collateralTransactionId: collateralTransfer.transactionId,
      collateralTransactionUrl: collateralTransfer.transactionUrl
    };

    store.policies.set(policy.id, policy);
    persistInsuranceStore(store);

    return policy;
  } catch (error) {
    throw toInsuranceError("Failed to underwrite commitment.", error);
  }
}

export function quoteCommitmentPremium(
  coverageAmountHbar: number,
  riskScore: number,
  marketVolatility: number,
  durationDays: number
): { premiumAmountHbar: number; premiumRateBps: number } {
  const quote = calculatePremium({
    coverageAmountHbar,
    riskScore,
    marketVolatility,
    durationDays
  });

  return {
    premiumAmountHbar: quote.premiumAmountHbar,
    premiumRateBps: quote.premiumRateBps
  };
}
