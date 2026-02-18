import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { RepTokenConfig, ReputationAttestation } from "./types.js";

export interface ReputationStore {
  repToken: RepTokenConfig | null;
  topicId: string | null;
  topicUrl: string | null;
  attestations: ReputationAttestation[];
}

interface PersistedReputationStore {
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

function isPersistenceEnabled(): boolean {
  const flag = (process.env.SIMULACRUM_PERSIST_STATE ?? "true").toLowerCase();

  if (flag === "0" || flag === "false" || flag === "off") {
    return false;
  }

  return process.env.NODE_ENV !== "test";
}

function stateDirectory(): string {
  return resolve(process.env.SIMULACRUM_STATE_DIR ?? resolve(process.cwd(), ".simulacrum-state"));
}

function stateFilePath(): string {
  return resolve(stateDirectory(), "reputation.json");
}

function loadStoreFromDisk(): ReputationStore {
  const store = createReputationStore();

  if (!isPersistenceEnabled()) {
    return store;
  }

  const filePath = stateFilePath();

  if (!existsSync(filePath)) {
    return store;
  }

  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistedReputationStore>;

    store.repToken = parsed.repToken ?? null;
    store.topicId = parsed.topicId ?? null;
    store.topicUrl = parsed.topicUrl ?? null;
    store.attestations = parsed.attestations ?? [];
  } catch {
    return createReputationStore();
  }

  return store;
}

function persistStoreToDisk(store: ReputationStore): void {
  if (!isPersistenceEnabled()) {
    return;
  }

  const dir = stateDirectory();
  const filePath = stateFilePath();
  const tempPath = `${filePath}.tmp`;

  mkdirSync(dir, { recursive: true });
  writeFileSync(tempPath, JSON.stringify(store, null, 2), "utf8");
  renameSync(tempPath, filePath);
}

function clearStoreFromDisk(): void {
  if (!isPersistenceEnabled()) {
    return;
  }

  const filePath = stateFilePath();

  if (existsSync(filePath)) {
    rmSync(filePath, { force: true });
  }
}

let defaultReputationStore = loadStoreFromDisk();

export function getReputationStore(store?: ReputationStore): ReputationStore {
  return store ?? defaultReputationStore;
}

export function persistReputationStore(store?: ReputationStore): void {
  persistStoreToDisk(getReputationStore(store));
}

export function resetReputationStoreForTests(): void {
  defaultReputationStore = createReputationStore();
  clearStoreFromDisk();
}
