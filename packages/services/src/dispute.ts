import { submitMessage, validateNonEmptyString } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";

import { getServiceStore, persistServiceStore, type ServiceStore } from "./store.js";
import { type DisputeRequestInput, type ServiceRequest, ServiceError } from "./types.js";

interface DisputeRequestDependencies {
  submitMessage: typeof submitMessage;
  now: () => Date;
}

export interface DisputeRequestOptions {
  client?: Client;
  store?: ServiceStore;
  deps?: Partial<DisputeRequestDependencies>;
}

function toServiceError(message: string, error: unknown): ServiceError {
  if (error instanceof ServiceError) return error;
  return new ServiceError(message, error);
}

export async function disputeRequest(
  input: DisputeRequestInput,
  options: DisputeRequestOptions = {}
): Promise<ServiceRequest> {
  validateNonEmptyString(input.serviceId, "serviceId");
  validateNonEmptyString(input.requestId, "requestId");
  validateNonEmptyString(input.requesterAccountId, "requesterAccountId");
  validateNonEmptyString(input.reason, "reason");

  const deps: DisputeRequestDependencies = {
    submitMessage,
    now: () => new Date(),
    ...options.deps
  };

  const store = getServiceStore(options.store);
  const service = store.services.get(input.serviceId);

  if (!service) {
    throw new ServiceError(`Service ${input.serviceId} not found.`);
  }

  const request = store.requests.get(input.requestId);

  if (!request) {
    throw new ServiceError(`Request ${input.requestId} not found.`);
  }

  if (request.requesterAccountId !== input.requesterAccountId) {
    throw new ServiceError("Only the requester can dispute a request.");
  }

  if (request.status !== "COMPLETED" && request.status !== "ACCEPTED" && request.status !== "IN_PROGRESS") {
    throw new ServiceError(`Request is ${request.status}, cannot dispute.`);
  }

  try {
    const nowIso = deps.now().toISOString();
    request.status = "DISPUTED";
    request.disputedAt = nowIso;
    store.requests.set(request.id, request);
    persistServiceStore(store);

    await deps.submitMessage(
      service.id,
      {
        type: "SERVICE_REQUEST_DISPUTED",
        requestId: request.id,
        serviceId: service.id,
        requesterAccountId: input.requesterAccountId,
        reason: input.reason,
        disputedAt: nowIso
      },
      { client: options.client }
    );

    return request;
  } catch (error) {
    throw toServiceError("Failed to dispute request.", error);
  }
}
