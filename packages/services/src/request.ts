import { submitMessage, transferHbar, validateNonEmptyString } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";
import crypto from "node:crypto";

import { getServiceStore, persistServiceStore, type ServiceStore } from "./store.js";
import {
  type AcceptRequestInput,
  type RequestServiceInput,
  type ServiceRequest,
  ServiceError
} from "./types.js";

interface RequestServiceDependencies {
  submitMessage: typeof submitMessage;
  transferHbar: typeof transferHbar;
  now: () => Date;
}

export interface RequestServiceOptions {
  client?: Client;
  store?: ServiceStore;
  deps?: Partial<RequestServiceDependencies>;
}

function toServiceError(message: string, error: unknown): ServiceError {
  if (error instanceof ServiceError) return error;
  return new ServiceError(message, error);
}

export async function requestService(
  input: RequestServiceInput,
  options: RequestServiceOptions = {}
): Promise<ServiceRequest> {
  validateNonEmptyString(input.serviceId, "serviceId");
  validateNonEmptyString(input.requesterAccountId, "requesterAccountId");
  validateNonEmptyString(input.input, "input");

  const deps: RequestServiceDependencies = {
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

  if (service.status !== "ACTIVE") {
    throw new ServiceError(`Service ${input.serviceId} is not active.`);
  }

  if (input.requesterAccountId === service.providerAccountId) {
    throw new ServiceError("Cannot request your own service.");
  }

  try {
    await deps.transferHbar(input.requesterAccountId, service.providerAccountId, service.priceHbar, {
      client: options.client
    });

    const nowIso = deps.now().toISOString();
    const request: ServiceRequest = {
      id: crypto.randomUUID(),
      serviceId: input.serviceId,
      requesterAccountId: input.requesterAccountId,
      providerAccountId: service.providerAccountId,
      priceHbar: service.priceHbar,
      status: "PENDING",
      input: input.input,
      createdAt: nowIso
    };

    store.requests.set(request.id, request);
    persistServiceStore(store);

    await deps.submitMessage(
      service.id,
      {
        type: "SERVICE_REQUESTED",
        requestId: request.id,
        serviceId: service.id,
        requesterAccountId: input.requesterAccountId,
        priceHbar: service.priceHbar,
        createdAt: nowIso
      },
      { client: options.client }
    );

    return request;
  } catch (error) {
    throw toServiceError("Failed to request service.", error);
  }
}

export async function acceptRequest(
  input: AcceptRequestInput,
  options: RequestServiceOptions = {}
): Promise<ServiceRequest> {
  validateNonEmptyString(input.serviceId, "serviceId");
  validateNonEmptyString(input.requestId, "requestId");
  validateNonEmptyString(input.providerAccountId, "providerAccountId");

  const deps: RequestServiceDependencies = {
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
    throw new ServiceError("Only the provider can accept requests.");
  }

  const request = store.requests.get(input.requestId);

  if (!request) {
    throw new ServiceError(`Request ${input.requestId} not found.`);
  }

  if (request.serviceId !== input.serviceId) {
    throw new ServiceError("Request does not belong to this service.");
  }

  if (request.status !== "PENDING") {
    throw new ServiceError(`Request is ${request.status}, cannot accept.`);
  }

  try {
    const nowIso = deps.now().toISOString();
    request.status = "ACCEPTED";
    request.acceptedAt = nowIso;
    store.requests.set(request.id, request);
    persistServiceStore(store);

    await deps.submitMessage(
      service.id,
      {
        type: "SERVICE_REQUEST_ACCEPTED",
        requestId: request.id,
        serviceId: service.id,
        providerAccountId: input.providerAccountId,
        acceptedAt: nowIso
      },
      { client: options.client }
    );

    return request;
  } catch (error) {
    throw toServiceError("Failed to accept request.", error);
  }
}
