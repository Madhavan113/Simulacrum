export type AssuranceStatus = "OPEN" | "TRIGGERED" | "FAILED" | "CLOSED";

export interface AssuranceContract {
  id: string;
  title: string;
  description?: string;
  organizerAccountId: string;
  escrowAccountId: string;
  thresholdHbar: number;
  pledgedHbar: number;
  deadline: string;
  createdAt: string;
  status: AssuranceStatus;
  topicId?: string;
  topicUrl?: string;
}

export interface AssurancePledge {
  id: string;
  contractId: string;
  accountId: string;
  amountHbar: number;
  createdAt: string;
  transactionId?: string;
  transactionUrl?: string;
}

export type CommitmentStatus = "OPEN" | "ACTIVE" | "COMPLETED" | "FAILED";

export interface CollectiveCommitment {
  id: string;
  name: string;
  description?: string;
  creatorAccountId: string;
  requiredParticipants: number;
  participantIds: string[];
  completedBy: string[];
  deadline: string;
  createdAt: string;
  status: CommitmentStatus;
  topicId?: string;
  topicUrl?: string;
}

export interface SchellingVote {
  voterAccountId: string;
  option: string;
  weight: number;
}

export class CoordinationError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "CoordinationError";
  }
}
