import { createPersistentStore } from "@simulacrum/core";

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

const persistence = createPersistentStore<MarketStore, PersistedMarketStore>({
  fileName: "markets.json",
  create: createMarketStore,
  serialize(store) {
    return {
      markets: Array.from(store.markets.entries()),
      bets: Array.from(store.bets.entries()),
      claims: Array.from(store.claims.entries()),
      claimIndex: Array.from(store.claimIndex.values()),
      orders: Array.from(store.orders.entries())
    };
  },
  deserialize(store, data) {
    for (const [key, value] of data.markets ?? []) {
      store.markets.set(key, value);
    }
    for (const [key, value] of data.bets ?? []) {
      store.bets.set(key, value);
    }
    for (const [key, value] of data.claims ?? []) {
      store.claims.set(key, value);
    }
    for (const key of data.claimIndex ?? []) {
      store.claimIndex.add(key);
    }
    for (const [key, value] of data.orders ?? []) {
      store.orders.set(key, value);
    }
  }
});

export function getMarketStore(store?: MarketStore): MarketStore {
  return persistence.get(store);
}

export function persistMarketStore(store?: MarketStore): void {
  persistence.persist(store);
}

export function resetMarketStoreForTests(): void {
  persistence.reset();
}
