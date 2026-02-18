import { createPersistentStore } from "@simulacrum/core";

import type { RepTokenConfig, ReputationAttestation } from "./types.js";

export interface ReputationStore {
  repToken: RepTokenConfig | null;
  topicId: string | null;
  topicUrl: string | null;
  attestations: ReputationAttestation[];
}

export function createReputationStore(): ReputationStore {
  return {
    repToken: null,
    topicId: null,
    topicUrl: null,
    attestations: []
  };
}

const persistence = createPersistentStore<ReputationStore, ReputationStore>({
  fileName: "reputation.json",
  create: createReputationStore,
  serialize(store) {
    return { ...store };
  },
  deserialize(store, data) {
    store.repToken = data.repToken ?? null;
    store.topicId = data.topicId ?? null;
    store.topicUrl = data.topicUrl ?? null;
    store.attestations = data.attestations ?? [];
  }
});

export function getReputationStore(store?: ReputationStore): ReputationStore {
  return persistence.get(store);
}

export function persistReputationStore(store?: ReputationStore): void {
  persistence.persist(store);
}

export function resetReputationStoreForTests(): void {
  persistence.reset();
}
