export type PolicyStatus = "ACTIVE" | "CLAIMED" | "EXPIRED" | "CANCELLED";

export interface InsurancePolicy {
  id: string;
  marketId: string;
  underwriterAccountId: string;
  beneficiaryAccountId: string;
  escrowAccountId: string;
  coverageAmountHbar: number;
  premiumAmountHbar: number;
  premiumRateBps: number;
  expirationTime: string;
  createdAt: string;
  status: PolicyStatus;
  collateralTransactionId?: string;
  collateralTransactionUrl?: string;
  payoutTransactionId?: string;
  payoutTransactionUrl?: string;
}

export interface InsurancePool {
  id: string;
  managerAccountId: string;
  escrowAccountId: string;
  liquidityHbar: number;
  reservedHbar: number;
  createdAt: string;
  updatedAt: string;
}

export interface UnderwriteInput {
  marketId: string;
  underwriterAccountId: string;
  beneficiaryAccountId: string;
  coverageAmountHbar: number;
  premiumRateBps: number;
  expirationTime: string;
  escrowAccountId?: string;
}

export interface ClaimPolicyInput {
  policyId: string;
  claimantAccountId: string;
  triggerReason: string;
  payoutAmountHbar?: number;
}

export class InsuranceError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "InsuranceError";
  }
}
