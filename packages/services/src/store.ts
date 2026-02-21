import { createPersistentStore } from "@simulacrum/core";

import type { Service, ServiceRequest, ServiceReview } from "./types.js";

export interface ServiceStore {
  services: Map<string, Service>;
  requests: Map<string, ServiceRequest>;
  reviews: Map<string, ServiceReview[]>;
}

interface PersistedServiceStore {
  services: Array<[string, Service]>;
  requests: Array<[string, ServiceRequest]>;
  reviews: Array<[string, ServiceReview[]]>;
}

export function createServiceStore(): ServiceStore {
  return {
    services: new Map<string, Service>(),
    requests: new Map<string, ServiceRequest>(),
    reviews: new Map<string, ServiceReview[]>()
  };
}

const persistence = createPersistentStore<ServiceStore, PersistedServiceStore>({
  fileName: "services.json",
  create: createServiceStore,
  serialize(store) {
    return {
      services: Array.from(store.services.entries()),
      requests: Array.from(store.requests.entries()),
      reviews: Array.from(store.reviews.entries())
    };
  },
  deserialize(store, data) {
    for (const [key, value] of data.services ?? []) {
      store.services.set(key, value);
    }
    for (const [key, value] of data.requests ?? []) {
      store.requests.set(key, value);
    }
    for (const [key, value] of data.reviews ?? []) {
      store.reviews.set(key, value);
    }
  }
});

export function getServiceStore(store?: ServiceStore): ServiceStore {
  return persistence.get(store);
}

export function persistServiceStore(store?: ServiceStore): void {
  persistence.persist(store);
}

export function resetServiceStoreForTests(): void {
  persistence.reset();
}
