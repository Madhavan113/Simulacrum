import { createTopic, submitMessage, validateNonEmptyString, validatePositiveNumber } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";

import { getServiceStore, persistServiceStore, type ServiceStore } from "./store.js";
import { type RegisterServiceInput, type Service, ServiceError } from "./types.js";

interface RegisterServiceDependencies {
  createTopic: typeof createTopic;
  submitMessage: typeof submitMessage;
  now: () => Date;
}

export interface RegisterServiceOptions {
  client?: Client;
  store?: ServiceStore;
  deps?: Partial<RegisterServiceDependencies>;
}

export interface RegisterServiceResult {
  service: Service;
  topicTransactionId: string;
  topicTransactionUrl: string;
}

function toServiceError(message: string, error: unknown): ServiceError {
  if (error instanceof ServiceError) return error;
  return new ServiceError(message, error);
}

export async function registerService(
  input: RegisterServiceInput,
  options: RegisterServiceOptions = {}
): Promise<RegisterServiceResult> {
  validateNonEmptyString(input.providerAccountId, "providerAccountId");
  validateNonEmptyString(input.name, "name");
  validateNonEmptyString(input.description, "description");
  validateNonEmptyString(input.category, "category");
  validatePositiveNumber(input.priceHbar, "priceHbar");

  const deps: RegisterServiceDependencies = {
    createTopic,
    submitMessage,
    now: () => new Date(),
    ...options.deps
  };

  const store = getServiceStore(options.store);

  try {
    const topic = await deps.createTopic(`SERVICE:${input.name}`, undefined, {
      client: options.client
    });

    const nowIso = deps.now().toISOString();
    const service: Service = {
      id: topic.topicId,
      providerAccountId: input.providerAccountId,
      name: input.name,
      description: input.description,
      category: input.category,
      priceHbar: input.priceHbar,
      status: "ACTIVE",
      rating: 0,
      reviewCount: 0,
      completedCount: 0,
      tags: input.tags ?? [],
      createdAt: nowIso,
      updatedAt: nowIso
    };

    store.services.set(service.id, service);
    persistServiceStore(store);

    await deps.submitMessage(
      topic.topicId,
      {
        type: "SERVICE_REGISTERED",
        serviceId: service.id,
        name: service.name,
        category: service.category,
        priceHbar: service.priceHbar,
        providerAccountId: service.providerAccountId,
        createdAt: service.createdAt
      },
      { client: options.client }
    );

    return {
      service,
      topicTransactionId: topic.transactionId,
      topicTransactionUrl: topic.transactionUrl
    };
  } catch (error) {
    throw toServiceError("Failed to register service.", error);
  }
}
