export type TaskStatus = "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "REVIEW" | "COMPLETED" | "DISPUTED" | "EXPIRED" | "CANCELLED";
export type BidStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
export type TaskCategory = "RESEARCH" | "PREDICTION" | "DATA_COLLECTION" | "ANALYSIS" | "DEVELOPMENT" | "CUSTOM";

export interface Task {
  id: string;
  posterAccountId: string;
  title: string;
  description: string;
  category: TaskCategory;
  bountyHbar: number;
  deadline: string;
  status: TaskStatus;
  requiredReputation: number;
  maxBids: number;
  assigneeAccountId?: string;
  acceptedBidId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  posterAccountId: string;
  title: string;
  description: string;
  category: TaskCategory;
  bountyHbar: number;
  deadline: string;
  requiredReputation?: number;
  maxBids?: number;
}

export interface TaskBid {
  id: string;
  taskId: string;
  bidderAccountId: string;
  proposedPriceHbar: number;
  estimatedCompletion: string;
  proposal: string;
  status: BidStatus;
  createdAt: string;
}

export interface BidOnTaskInput {
  taskId: string;
  bidderAccountId: string;
  proposedPriceHbar: number;
  estimatedCompletion: string;
  proposal: string;
}

export interface AcceptBidInput {
  taskId: string;
  bidId: string;
  posterAccountId: string;
}

export interface TaskSubmission {
  id: string;
  taskId: string;
  bidId: string;
  submitterAccountId: string;
  deliverable: string;
  submittedAt: string;
}

export interface SubmitWorkInput {
  taskId: string;
  submitterAccountId: string;
  deliverable: string;
}

export interface ApproveWorkInput {
  taskId: string;
  posterAccountId: string;
}

export interface DisputeWorkInput {
  taskId: string;
  posterAccountId: string;
  reason: string;
}

export interface CancelTaskInput {
  taskId: string;
  posterAccountId: string;
}

export class TaskError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "TaskError";
  }
}
