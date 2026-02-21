import { createPersistentStore } from "@simulacrum/core";

import type {
  FundingPayment,
  FundingRate,
  InsuranceFund,
  LiquidationEvent,
  MarginAccount,
  OptionContract,
  PerpetualPosition,
  PriceSnapshot
} from "./types.js";

export interface DerivativesStore {
  margins: Map<string, MarginAccount>;
  positions: Map<string, PerpetualPosition>;
  options: Map<string, OptionContract>;
  priceSnapshots: Map<string, PriceSnapshot>;
  fundingRates: Map<string, FundingRate[]>;
  fundingPayments: Map<string, FundingPayment[]>;
  liquidations: LiquidationEvent[];
  insuranceFund: InsuranceFund;
}

interface PersistedDerivativesStore {
  margins: Array<[string, MarginAccount]>;
  positions: Array<[string, PerpetualPosition]>;
  options: Array<[string, OptionContract]>;
  priceSnapshots: Array<[string, PriceSnapshot]>;
  fundingRates: Array<[string, FundingRate[]]>;
  fundingPayments: Array<[string, FundingPayment[]]>;
  liquidations: LiquidationEvent[];
  insuranceFund: InsuranceFund;
}

const DEFAULT_INSURANCE_FUND: InsuranceFund = {
  balanceHbar: 0,
  totalDeposits: 0,
  totalPayouts: 0,
  updatedAt: new Date().toISOString()
};

export function createDerivativesStore(): DerivativesStore {
  return {
    margins: new Map(),
    positions: new Map(),
    options: new Map(),
    priceSnapshots: new Map(),
    fundingRates: new Map(),
    fundingPayments: new Map(),
    liquidations: [],
    insuranceFund: { ...DEFAULT_INSURANCE_FUND }
  };
}

const persistence = createPersistentStore<DerivativesStore, PersistedDerivativesStore>({
  fileName: "derivatives.json",
  create: createDerivativesStore,
  serialize(store) {
    return {
      margins: Array.from(store.margins.entries()),
      positions: Array.from(store.positions.entries()),
      options: Array.from(store.options.entries()),
      priceSnapshots: Array.from(store.priceSnapshots.entries()),
      fundingRates: Array.from(store.fundingRates.entries()),
      fundingPayments: Array.from(store.fundingPayments.entries()),
      liquidations: store.liquidations,
      insuranceFund: store.insuranceFund
    };
  },
  deserialize(store, data) {
    for (const [key, value] of data.margins ?? []) {
      store.margins.set(key, value);
    }
    for (const [key, value] of data.positions ?? []) {
      store.positions.set(key, value);
    }
    for (const [key, value] of data.options ?? []) {
      store.options.set(key, value);
    }
    for (const [key, value] of data.priceSnapshots ?? []) {
      store.priceSnapshots.set(key, value);
    }
    for (const [key, value] of data.fundingRates ?? []) {
      store.fundingRates.set(key, value);
    }
    for (const [key, value] of data.fundingPayments ?? []) {
      store.fundingPayments.set(key, value);
    }
    if (data.liquidations) {
      store.liquidations = data.liquidations;
    }
    if (data.insuranceFund) {
      store.insuranceFund = data.insuranceFund;
    }
  }
});

export function getDerivativesStore(store?: DerivativesStore): DerivativesStore {
  return persistence.get(store);
}

export function persistDerivativesStore(store?: DerivativesStore): void {
  persistence.persist(store);
}

export function resetDerivativesStoreForTests(): void {
  persistence.reset();
}
