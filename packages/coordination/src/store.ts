import { createPersistentStore } from "@simulacrum/core";

import type {
  AssuranceContract,
  AssurancePledge,
  CollectiveCommitment
} from "./types.js";

export interface CoordinationStore {
  assuranceContracts: Map<string, AssuranceContract>;
  assurancePledges: Map<string, AssurancePledge[]>;
  commitments: Map<string, CollectiveCommitment>;
}

interface PersistedCoordinationStore {
  assuranceContracts: Array<[string, AssuranceContract]>;
  assurancePledges: Array<[string, AssurancePledge[]]>;
  commitments: Array<[string, CollectiveCommitment]>;
}

export function createCoordinationStore(): CoordinationStore {
  return {
    assuranceContracts: new Map<string, AssuranceContract>(),
    assurancePledges: new Map<string, AssurancePledge[]>(),
    commitments: new Map<string, CollectiveCommitment>()
  };
}

const persistence = createPersistentStore<CoordinationStore, PersistedCoordinationStore>({
  fileName: "coordination.json",
  create: createCoordinationStore,
  serialize(store) {
    return {
      assuranceContracts: Array.from(store.assuranceContracts.entries()),
      assurancePledges: Array.from(store.assurancePledges.entries()),
      commitments: Array.from(store.commitments.entries())
    };
  },
  deserialize(store, data) {
    for (const [key, value] of data.assuranceContracts ?? []) {
      store.assuranceContracts.set(key, value);
    }
    for (const [key, value] of data.assurancePledges ?? []) {
      store.assurancePledges.set(key, value);
    }
    for (const [key, value] of data.commitments ?? []) {
      store.commitments.set(key, value);
    }
  }
});

export function getCoordinationStore(store?: CoordinationStore): CoordinationStore {
  return persistence.get(store);
}

export function persistCoordinationStore(store?: CoordinationStore): void {
  persistence.persist(store);
}

export function resetCoordinationStoreForTests(): void {
  persistence.reset();
}
