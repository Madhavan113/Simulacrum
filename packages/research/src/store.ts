import { createPersistentStore } from "@simulacrum/core";
import type {
  ResearchAgentProfile,
  ResearchObservation,
  ResearchPublication,
  PublicationEvaluation,
} from "@simulacrum/types";
import type { PipelineSnapshot } from "./types.js";

export interface ResearchStore {
  publications: Map<string, ResearchPublication>;
  evaluations: Map<string, PublicationEvaluation>;
  observations: ResearchObservation[];
  agentProfiles: Map<string, ResearchAgentProfile>;
  pipelines: Map<string, PipelineSnapshot>;
}

interface PersistedResearchStore {
  publications: Array<[string, ResearchPublication]>;
  evaluations: Array<[string, PublicationEvaluation]>;
  observations: ResearchObservation[];
  agentProfiles: Array<[string, ResearchAgentProfile]>;
  pipelines: Array<[string, PipelineSnapshot]>;
}

const MAX_PERSISTED_OBSERVATIONS = 10_000;

export function createResearchStore(): ResearchStore {
  return {
    publications: new Map(),
    evaluations: new Map(),
    observations: [],
    agentProfiles: new Map(),
    pipelines: new Map(),
  };
}

const persistence = createPersistentStore<ResearchStore, PersistedResearchStore>({
  fileName: "research.json",
  create: createResearchStore,
  serialize(store) {
    const obs = store.observations.length > MAX_PERSISTED_OBSERVATIONS
      ? store.observations.slice(-MAX_PERSISTED_OBSERVATIONS)
      : store.observations;

    return {
      publications: Array.from(store.publications.entries()),
      evaluations: Array.from(store.evaluations.entries()),
      observations: obs,
      agentProfiles: Array.from(store.agentProfiles.entries()),
      pipelines: Array.from(store.pipelines.entries()),
    };
  },
  deserialize(store, data) {
    for (const [key, value] of data.publications ?? []) {
      store.publications.set(key, value);
    }
    for (const [key, value] of data.evaluations ?? []) {
      store.evaluations.set(key, value);
    }
    store.observations = data.observations ?? [];
    for (const [key, value] of data.agentProfiles ?? []) {
      store.agentProfiles.set(key, value);
    }
    for (const [key, value] of data.pipelines ?? []) {
      store.pipelines.set(key, value);
    }
  },
});

export function getResearchStore(store?: ResearchStore): ResearchStore {
  return persistence.get(store);
}

export function persistResearchStore(store?: ResearchStore): void {
  persistence.persist(store);
}

export function resetResearchStoreForTests(): void {
  persistence.reset();
}
