import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

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
  return resolve(stateDirectory(), "coordination.json");
}

function serializeStore(store: CoordinationStore): PersistedCoordinationStore {
  return {
    assuranceContracts: Array.from(store.assuranceContracts.entries()),
    assurancePledges: Array.from(store.assurancePledges.entries()),
    commitments: Array.from(store.commitments.entries())
  };
}

function loadStoreFromDisk(): CoordinationStore {
  const store = createCoordinationStore();

  if (!isPersistenceEnabled()) {
    return store;
  }

  const filePath = stateFilePath();

  if (!existsSync(filePath)) {
    return store;
  }

  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistedCoordinationStore>;

    for (const [key, value] of parsed.assuranceContracts ?? []) {
      store.assuranceContracts.set(key, value);
    }
    for (const [key, value] of parsed.assurancePledges ?? []) {
      store.assurancePledges.set(key, value);
    }
    for (const [key, value] of parsed.commitments ?? []) {
      store.commitments.set(key, value);
    }
  } catch {
    return createCoordinationStore();
  }

  return store;
}

function persistStoreToDisk(store: CoordinationStore): void {
  if (!isPersistenceEnabled()) {
    return;
  }

  const dir = stateDirectory();
  const filePath = stateFilePath();
  const tempPath = `${filePath}.tmp`;

  mkdirSync(dir, { recursive: true });
  writeFileSync(tempPath, JSON.stringify(serializeStore(store), null, 2), "utf8");
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

let defaultCoordinationStore = loadStoreFromDisk();

export function getCoordinationStore(store?: CoordinationStore): CoordinationStore {
  return store ?? defaultCoordinationStore;
}

export function persistCoordinationStore(store?: CoordinationStore): void {
  persistStoreToDisk(getCoordinationStore(store));
}

export function resetCoordinationStoreForTests(): void {
  defaultCoordinationStore = createCoordinationStore();
  clearStoreFromDisk();
}
