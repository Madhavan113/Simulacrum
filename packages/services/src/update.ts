import { validateNonEmptyString } from "@simulacrum/core";

import { getServiceStore, persistServiceStore, type ServiceStore } from "./store.js";
import { type UpdateServiceInput, type Service, ServiceError } from "./types.js";

export interface UpdateServiceOptions {
  store?: ServiceStore;
  now?: () => Date;
}

export function updateService(
  input: UpdateServiceInput,
  options: UpdateServiceOptions = {}
): Service {
  validateNonEmptyString(input.serviceId, "serviceId");
  validateNonEmptyString(input.providerAccountId, "providerAccountId");

  const now = options.now ?? (() => new Date());
  const store = getServiceStore(options.store);
  const service = store.services.get(input.serviceId);

  if (!service) {
    throw new ServiceError(`Service ${input.serviceId} not found.`);
  }

  if (service.providerAccountId !== input.providerAccountId) {
    throw new ServiceError("Only the provider can update this service.");
  }

  if (input.name !== undefined) service.name = input.name;
  if (input.description !== undefined) service.description = input.description;
  if (input.priceHbar !== undefined) service.priceHbar = input.priceHbar;
  if (input.status !== undefined) service.status = input.status;
  if (input.tags !== undefined) service.tags = input.tags;
  service.updatedAt = now().toISOString();

  store.services.set(service.id, service);
  persistServiceStore(store);

  return service;
}
