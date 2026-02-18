import { transferHbar, validateNonEmptyString, validatePositiveNumber } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";

import { getInsuranceStore, persistInsuranceStore, type InsuranceStore } from "./store.js";
import { type ClaimPolicyInput, type InsurancePolicy, InsuranceError } from "./types.js";

interface ClaimDependencies {
  transferHbar: typeof transferHbar;
  now: () => Date;
}

export interface ClaimPolicyOptions {
  client?: Client;
  store?: InsuranceStore;
  deps?: Partial<ClaimDependencies>;
}

function toInsuranceError(message: string, error: unknown): InsuranceError {
  if (error instanceof InsuranceError) {
    return error;
  }

  return new InsuranceError(message, error);
}

function payoutAmountFor(policy: InsurancePolicy, requestedPayout?: number): number {
  if (requestedPayout === undefined) {
    return policy.coverageAmountHbar;
  }

  validatePositiveNumber(requestedPayout, "payoutAmountHbar");

  if (requestedPayout > policy.coverageAmountHbar) {
    throw new InsuranceError("Requested payout exceeds policy coverage.");
  }

  return requestedPayout;
}

export async function processClaim(
  input: ClaimPolicyInput,
  options: ClaimPolicyOptions = {}
): Promise<InsurancePolicy> {
  validateNonEmptyString(input.policyId, "policyId");
  validateNonEmptyString(input.claimantAccountId, "claimantAccountId");
  validateNonEmptyString(input.triggerReason, "triggerReason");

  const store = getInsuranceStore(options.store);
  const policy = store.policies.get(input.policyId);

  if (!policy) {
    throw new InsuranceError(`Policy ${input.policyId} was not found.`);
  }

  const deps: ClaimDependencies = {
    transferHbar,
    now: () => new Date(),
    ...options.deps
  };

  if (policy.status !== "ACTIVE") {
    throw new InsuranceError(`Policy ${input.policyId} is not active.`);
  }

  const now = deps.now();

  if (now.getTime() > Date.parse(policy.expirationTime)) {
    policy.status = "EXPIRED";
    persistInsuranceStore(store);
    throw new InsuranceError(`Policy ${input.policyId} is expired.`);
  }

  const payoutHbar = payoutAmountFor(policy, input.payoutAmountHbar);

  try {
    const payout = await deps.transferHbar(
      policy.escrowAccountId,
      input.claimantAccountId,
      payoutHbar,
      {
        client: options.client
      }
    );

    policy.status = "CLAIMED";
    policy.payoutTransactionId = payout.transactionId;
    policy.payoutTransactionUrl = payout.transactionUrl;
    persistInsuranceStore(store);

    return policy;
  } catch (error) {
    throw toInsuranceError(`Failed to process policy claim for ${input.policyId}.`, error);
  }
}
