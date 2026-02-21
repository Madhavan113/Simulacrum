import { submitMessage, transferHbar, validateNonEmptyString } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";

import { getServiceStore, persistServiceStore, type ServiceStore } from "./store.js";
import {
  type CancelRequestInput,
  type CompleteRequestInput,
  type ServiceRequest,
  ServiceError
} from "./types.js";

interface CompleteRequestDependencies {
  submitMessage: typeof submitMessage;
  transferHbar: typeof transferHbar;
  now: () => Date;
}

export interface CompleteRequestOptions {
  client?: Client;
  store?: ServiceStore;
  deps?: Partial<CompleteRequestDependencies>;
}

function toServiceError(message: string, error: unknown): ServiceError {
  if (error instanceof ServiceError) return error;
  return new ServiceError(message, error);
}

export async function completeRequest(
  input: CompleteRequestInput,
  options: CompleteRequestOptions = {}
): Promise<ServiceRequest> {
  validateNonEmptyString(input.serviceId, "serviceId");
  validateNonEmptyString(input.requestId, "requestId");
  validateNonEmptyString(input.providerAccountId, "providerAccountId");
  validateNonEmptyString(input.output, "output");

  const deps: CompleteRequestDependencies = {
    submitMessage,
    transferHbar,
    now: () => new Date(),
    ...options.deps
  };

  const store = getServiceStore(options.store);
  const service = store.services.get(input.serviceId);

  if (!service) {
    throw new ServiceError(`Service ${input.serviceId} not found.`);
  }

  if (service.providerAccountId !== input.providerAccountId) {
    throw new ServiceError("Only the provider can complete requests.");
  }

  const request = store.requests.get(input.requestId);

  if (!request) {
    throw new ServiceError(`Request ${input.requestId} not found.`);
  }

  if (request.serviceId !== input.serviceId) {
    throw new ServiceError("Request does not belong to this service.");
  }

  if (request.status !== "ACCEPTED" && request.status !== "IN_PROGRESS") {
    throw new ServiceError(`Request is ${request.status}, cannot complete.`);
  }

  try {
    const nowIso = deps.now().toISOString();
    request.status = "COMPLETED";
    request.output = input.output;
    request.completedAt = nowIso;
    store.requests.set(request.id, request);

    service.completedCount += 1;
    service.updatedAt = nowIso;
    store.services.set(service.id, service);

    persistServiceStore(store);

    await deps.submitMessage(
      service.id,
      {
        type: "SERVICE_REQUEST_COMPLETED",
        requestId: request.id,
        serviceId: service.id,
        providerAccountId: input.providerAccountId,
        completedAt: nowIso
      },
      { client: options.client }
    );

    return request;
  } catch (error) {
    throw toServiceError("Failed to complete request.", error);
  }
}

export async function cancelRequest(
  input: CancelRequestInput,
  options: CompleteRequestOptions = {}
): Promise<ServiceRequest> {
  validateNonEmptyString(input.serviceId, "serviceId");
  validateNonEmptyString(input.requestId, "requestId");
  validateNonEmptyString(input.requesterAccountId, "requesterAccountId");

  const deps: CompleteRequestDependencies = {
    submitMessage,
    transferHbar,
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
    throw new ServiceError("Only the requester can cancel a request.");
  }

  if (request.status !== "PENDING") {
    throw new ServiceError(`Request is ${request.status}, can only cancel PENDING requests.`);
  }

  try {
    // Refund the requester
    await deps.transferHbar(service.providerAccountId, input.requesterAccountId, request.priceHbar, {
      client: options.client
    });

    const nowIso = deps.now().toISOString();
    request.status = "CANCELLED";
    request.cancelledAt = nowIso;
    store.requests.set(request.id, request);
    persistServiceStore(store);

    await deps.submitMessage(
      service.id,
      {
        type: "SERVICE_REQUEST_CANCELLED",
        requestId: request.id,
        serviceId: service.id,
        requesterAccountId: input.requesterAccountId,
        cancelledAt: nowIso
      },
      { client: options.client }
    );

    return request;
  } catch (error) {
    throw toServiceError("Failed to cancel request.", error);
  }
}
