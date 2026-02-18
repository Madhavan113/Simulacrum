import { randomUUID } from "node:crypto";

import { transferHbar, validateNonEmptyString, validatePositiveNumber } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";

import { getInsuranceStore, persistInsuranceStore, type InsuranceStore } from "./store.js";
import { type InsurancePool, InsuranceError } from "./types.js";

interface PoolDependencies {
  transferHbar: typeof transferHbar;
  now: () => Date;
}

export interface PoolOptions {
  client?: Client;
  store?: InsuranceStore;
  deps?: Partial<PoolDependencies>;
}

function toInsuranceError(message: string, error: unknown): InsuranceError {
  if (error instanceof InsuranceError) {
    return error;
  }

  return new InsuranceError(message, error);
}

export async function createInsurancePool(
  managerAccountId: string,
  escrowAccountId: string,
  initialLiquidityHbar: number,
  options: PoolOptions = {}
): Promise<InsurancePool> {
  validateNonEmptyString(managerAccountId, "managerAccountId");
  validateNonEmptyString(escrowAccountId, "escrowAccountId");
  validatePositiveNumber(initialLiquidityHbar, "initialLiquidityHbar");

  const deps: PoolDependencies = {
    transferHbar,
    now: () => new Date(),
    ...options.deps
  };
  const store = getInsuranceStore(options.store);

  try {
    await deps.transferHbar(managerAccountId, escrowAccountId, initialLiquidityHbar, {
      client: options.client
    });

    const nowIso = deps.now().toISOString();
    const pool: InsurancePool = {
      id: randomUUID(),
      managerAccountId,
      escrowAccountId,
      liquidityHbar: initialLiquidityHbar,
      reservedHbar: 0,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    store.pools.set(pool.id, pool);
    persistInsuranceStore(store);

    return pool;
  } catch (error) {
    throw toInsuranceError("Failed to create insurance pool.", error);
  }
}

export async function depositLiquidity(
  poolId: string,
  accountId: string,
  amountHbar: number,
  options: PoolOptions = {}
): Promise<InsurancePool> {
  validateNonEmptyString(poolId, "poolId");
  validateNonEmptyString(accountId, "accountId");
  validatePositiveNumber(amountHbar, "amountHbar");

  const deps: PoolDependencies = {
    transferHbar,
    now: () => new Date(),
    ...options.deps
  };
  const store = getInsuranceStore(options.store);
  const pool = store.pools.get(poolId);

  if (!pool) {
    throw new InsuranceError(`Pool ${poolId} was not found.`);
  }

  try {
    await deps.transferHbar(accountId, pool.escrowAccountId, amountHbar, {
      client: options.client
    });
    pool.liquidityHbar += amountHbar;
    pool.updatedAt = deps.now().toISOString();
    persistInsuranceStore(store);

    return pool;
  } catch (error) {
    throw toInsuranceError(`Failed to deposit liquidity into pool ${poolId}.`, error);
  }
}

export function reserveCoverage(poolId: string, amountHbar: number, store?: InsuranceStore): InsurancePool {
  validatePositiveNumber(amountHbar, "amountHbar");

  const resolvedStore = getInsuranceStore(store);
  const pool = resolvedStore.pools.get(poolId);

  if (!pool) {
    throw new InsuranceError(`Pool ${poolId} was not found.`);
  }

  if (pool.liquidityHbar - pool.reservedHbar < amountHbar) {
    throw new InsuranceError(`Pool ${poolId} has insufficient available liquidity.`);
  }

  pool.reservedHbar += amountHbar;
  pool.updatedAt = new Date().toISOString();
  persistInsuranceStore(resolvedStore);

  return pool;
}
