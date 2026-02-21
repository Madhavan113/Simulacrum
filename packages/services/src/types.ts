export type ServiceStatus = "ACTIVE" | "SUSPENDED" | "RETIRED";
export type ServiceCategory = "COMPUTE" | "DATA" | "RESEARCH" | "ANALYSIS" | "ORACLE" | "CUSTOM";
export type ServiceRequestStatus = "PENDING" | "ACCEPTED" | "IN_PROGRESS" | "COMPLETED" | "DISPUTED" | "CANCELLED";

export interface Service {
  id: string;
  providerAccountId: string;
  name: string;
  description: string;
  category: ServiceCategory;
  priceHbar: number;
  status: ServiceStatus;
  rating: number;
  reviewCount: number;
  completedCount: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RegisterServiceInput {
  providerAccountId: string;
  name: string;
  description: string;
  category: ServiceCategory;
  priceHbar: number;
  tags?: string[];
}

export interface UpdateServiceInput {
  serviceId: string;
  providerAccountId: string;
  name?: string;
  description?: string;
  priceHbar?: number;
  status?: ServiceStatus;
  tags?: string[];
}

export interface ServiceRequest {
  id: string;
  serviceId: string;
  requesterAccountId: string;
  providerAccountId: string;
  priceHbar: number;
  status: ServiceRequestStatus;
  input: string;
  output?: string;
  createdAt: string;
  acceptedAt?: string;
  completedAt?: string;
  disputedAt?: string;
  cancelledAt?: string;
}

export interface RequestServiceInput {
  serviceId: string;
  requesterAccountId: string;
  input: string;
}

export interface AcceptRequestInput {
  serviceId: string;
  requestId: string;
  providerAccountId: string;
}

export interface CompleteRequestInput {
  serviceId: string;
  requestId: string;
  providerAccountId: string;
  output: string;
}

export interface DisputeRequestInput {
  serviceId: string;
  requestId: string;
  requesterAccountId: string;
  reason: string;
}

export interface CancelRequestInput {
  serviceId: string;
  requestId: string;
  requesterAccountId: string;
}

export interface ServiceReview {
  id: string;
  serviceId: string;
  serviceRequestId: string;
  reviewerAccountId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface ReviewServiceInput {
  serviceId: string;
  serviceRequestId: string;
  reviewerAccountId: string;
  rating: number;
  comment: string;
}

export class ServiceError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "ServiceError";
  }
}
