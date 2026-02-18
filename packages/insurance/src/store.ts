import { createPersistentStore } from "@simulacrum/core";

import type { InsurancePolicy, InsurancePool } from "./types.js";

export interface InsuranceStore {
  policies: Map<string, InsurancePolicy>;
  pools: Map<string, InsurancePool>;
}

interface PersistedInsuranceStore {
  policies: Array<[string, InsurancePolicy]>;
  pools: Array<[string, InsurancePool]>;
}

export function createInsuranceStore(): InsuranceStore {
  return {
    policies: new Map<string, InsurancePolicy>(),
    pools: new Map<string, InsurancePool>()
  };
}

const persistence = createPersistentStore<InsuranceStore, PersistedInsuranceStore>({
  fileName: "insurance.json",
  create: createInsuranceStore,
  serialize(store) {
    return {
      policies: Array.from(store.policies.entries()),
      pools: Array.from(store.pools.entries())
    };
  },
  deserialize(store, data) {
    for (const [key, value] of data.policies ?? []) {
      store.policies.set(key, value);
    }
    for (const [key, value] of data.pools ?? []) {
      store.pools.set(key, value);
    }
  }
});

export function getInsuranceStore(store?: InsuranceStore): InsuranceStore {
  return persistence.get(store);
}

export function persistInsuranceStore(store?: InsuranceStore): void {
  persistence.persist(store);
}

export function resetInsuranceStoreForTests(): void {
  persistence.reset();
}
