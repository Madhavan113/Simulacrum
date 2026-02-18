import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ClaimRecord, Market, MarketBet, MarketOrder } from "./types.js";

export interface MarketStore {
  markets: Map<string, Market>;
  bets: Map<string, MarketBet[]>;
  claims: Map<string, ClaimRecord[]>;
  claimIndex: Set<string>;
  orders: Map<string, MarketOrder[]>;
}

interface PersistedMarketStore {
  markets: Array<[string, Market]>;
  bets: Array<[string, MarketBet[]]>;
  claims: Array<[string, ClaimRecord[]]>;
  claimIndex: string[];
  orders: Array<[string, MarketOrder[]]>;
}

export function createMarketStore(): MarketStore {
  return {
    markets: new Map<string, Market>(),
    bets: new Map<string, MarketBet[]>(),
    claims: new Map<string, ClaimRecord[]>(),
    claimIndex: new Set<string>(),
    orders: new Map<string, MarketOrder[]>()
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
  return resolve(stateDirectory(), "markets.json");
}

function serializeStore(store: MarketStore): PersistedMarketStore {
  return {
    markets: Array.from(store.markets.entries()),
    bets: Array.from(store.bets.entries()),
    claims: Array.from(store.claims.entries()),
    claimIndex: Array.from(store.claimIndex.values()),
    orders: Array.from(store.orders.entries())
  };
}

function loadStoreFromDisk(): MarketStore {
  const store = createMarketStore();

  if (!isPersistenceEnabled()) {
    return store;
  }

  const filePath = stateFilePath();

  if (!existsSync(filePath)) {
    return store;
  }

  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistedMarketStore>;

    for (const [key, value] of parsed.markets ?? []) {
      store.markets.set(key, value);
    }
    for (const [key, value] of parsed.bets ?? []) {
      store.bets.set(key, value);
    }
    for (const [key, value] of parsed.claims ?? []) {
      store.claims.set(key, value);
    }
    for (const key of parsed.claimIndex ?? []) {
      store.claimIndex.add(key);
    }
    for (const [key, value] of parsed.orders ?? []) {
      store.orders.set(key, value);
    }
  } catch {
    // Fall back to clean in-memory state if persisted payload is corrupt.
    return createMarketStore();
  }

  return store;
}

function persistStoreToDisk(store: MarketStore): void {
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

let defaultMarketStore = loadStoreFromDisk();

export function getMarketStore(store?: MarketStore): MarketStore {
  return store ?? defaultMarketStore;
}

export function persistMarketStore(store?: MarketStore): void {
  persistStoreToDisk(getMarketStore(store));
}

export function resetMarketStoreForTests(): void {
  defaultMarketStore = createMarketStore();
  clearStoreFromDisk();
}
