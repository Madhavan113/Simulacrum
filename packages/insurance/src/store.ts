import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

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
  return resolve(stateDirectory(), "insurance.json");
}

function serializeStore(store: InsuranceStore): PersistedInsuranceStore {
  return {
    policies: Array.from(store.policies.entries()),
    pools: Array.from(store.pools.entries())
  };
}

function loadStoreFromDisk(): InsuranceStore {
  const store = createInsuranceStore();

  if (!isPersistenceEnabled()) {
    return store;
  }

  const filePath = stateFilePath();

  if (!existsSync(filePath)) {
    return store;
  }

  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistedInsuranceStore>;

    for (const [key, value] of parsed.policies ?? []) {
      store.policies.set(key, value);
    }

    for (const [key, value] of parsed.pools ?? []) {
      store.pools.set(key, value);
    }
  } catch {
    return createInsuranceStore();
  }

  return store;
}

function persistStoreToDisk(store: InsuranceStore): void {
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

let defaultInsuranceStore = loadStoreFromDisk();

export function getInsuranceStore(store?: InsuranceStore): InsuranceStore {
  return store ?? defaultInsuranceStore;
}

export function persistInsuranceStore(store?: InsuranceStore): void {
  persistStoreToDisk(getInsuranceStore(store));
}

export function resetInsuranceStoreForTests(): void {
  defaultInsuranceStore = createInsuranceStore();
  clearStoreFromDisk();
}
