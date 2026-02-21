/**
 * Mark price oracle adapted from Hyperliquid's median-of-three model.
 *
 * For probability markets the "index price" is the current market odds for
 * a given outcome (0-1). The mark price — used for margin checks, PnL, and
 * liquidations — is the median of:
 *
 *   1. Index price (market probability from LMSR curve or CLOB midpoint)
 *   2. Last perpetual trade price
 *   3. EMA-smoothed perpetual price (150-second half-life by default)
 *
 * This dampens manipulation while still tracking real moves.
 */

import type { Market } from "@simulacrum/markets";

import { getDerivativesStore, persistDerivativesStore, type DerivativesStore } from "./store.js";
import type { PriceSnapshot } from "./types.js";

const DEFAULT_EMA_HALF_LIFE_MS = 150_000;

function median3(a: number, b: number, c: number): number {
  if (a > b) {
    if (b > c) return b;
    return a > c ? c : a;
  }
  if (a > c) return a;
  return b > c ? c : b;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getIndexPrice(market: Market, outcome: string): number {
  const odds = market.currentOddsByOutcome;
  if (!odds || !(outcome in odds)) {
    return 1 / market.outcomes.length;
  }
  return clamp((odds[outcome] ?? 50) / 100, 0.001, 0.999);
}

function computeEma(
  previous: number,
  current: number,
  elapsedMs: number,
  halfLifeMs: number
): number {
  const alpha = 1 - Math.exp((-Math.LN2 * elapsedMs) / halfLifeMs);
  return previous + alpha * (current - previous);
}

export interface ComputeMarkPriceOptions {
  store?: DerivativesStore;
  emaHalfLifeMs?: number;
  now?: () => Date;
}

/**
 * Compute or refresh a PriceSnapshot for a given market + outcome.
 *
 * `lastTradePrice` should be provided if a trade just occurred; otherwise
 * the stored value is re-used.
 */
export function computeMarkPrice(
  market: Market,
  outcome: string,
  lastTradePrice?: number,
  options: ComputeMarkPriceOptions = {}
): PriceSnapshot {
  const store = getDerivativesStore(options.store);
  const now = (options.now ?? (() => new Date()))();
  const halfLife = options.emaHalfLifeMs ?? DEFAULT_EMA_HALF_LIFE_MS;
  const key = `${market.id}:${outcome}`;

  const indexPrice = getIndexPrice(market, outcome);
  const previous = store.priceSnapshots.get(key);

  const trade = lastTradePrice ?? previous?.lastTradePrice ?? indexPrice;
  const prevEma = previous?.emaPrice ?? indexPrice;
  const elapsedMs = previous ? now.getTime() - Date.parse(previous.timestamp) : 0;

  const emaPrice = elapsedMs > 0
    ? computeEma(prevEma, trade, elapsedMs, halfLife)
    : prevEma;

  const markPrice = clamp(median3(indexPrice, trade, emaPrice), 0.001, 0.999);

  const snapshot: PriceSnapshot = {
    marketId: market.id,
    outcome,
    indexPrice,
    markPrice,
    lastTradePrice: trade,
    emaPrice,
    timestamp: now.toISOString()
  };

  store.priceSnapshots.set(key, snapshot);
  persistDerivativesStore(store);

  return snapshot;
}

/**
 * Retrieve the latest stored PriceSnapshot (or compute a fresh one).
 */
export function getMarkPrice(
  market: Market,
  outcome: string,
  options: ComputeMarkPriceOptions = {}
): PriceSnapshot {
  const store = getDerivativesStore(options.store);
  const existing = store.priceSnapshots.get(`${market.id}:${outcome}`);
  if (existing) return existing;
  return computeMarkPrice(market, outcome, undefined, options);
}
