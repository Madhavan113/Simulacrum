/**
 * Funding rate engine — Hyperliquid-style hourly settlement.
 *
 * The funding rate anchors the perpetual price to the underlying market
 * probability. When the perp trades at a premium to index (mark > index),
 * longs pay shorts. When it trades at a discount, shorts pay longs.
 *
 * Formula (per 8-hour period, paid 1/8 each hour):
 *   F = avg_premium + clamp(interest_rate - premium, -0.05%, 0.05%)
 *   premium = (mark_price - index_price) / index_price
 *
 * Interest rate: fixed at 0.01% per 8 hours (a basis rate for cost of capital).
 * Cap: ±4% per hour to prevent runaway funding.
 */

import { randomUUID } from "node:crypto";

import type { Market } from "@simulacrum/markets";

import { getMarkPrice } from "./pricing.js";
import { getDerivativesStore, persistDerivativesStore, type DerivativesStore } from "./store.js";
import type { FundingPayment, FundingRate, PerpetualPosition } from "./types.js";

const INTEREST_RATE_8H = 0.0001;
const PREMIUM_CLAMP = 0.0005;
const MAX_FUNDING_RATE_HOURLY = 0.04;

export interface FundingOptions {
  store?: DerivativesStore;
  now?: () => Date;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Compute the current funding rate for a market outcome.
 */
export function computeFundingRate(
  market: Market,
  outcome: string,
  options: FundingOptions = {}
): FundingRate {
  const store = getDerivativesStore(options.store);
  const now = (options.now ?? (() => new Date()))();

  const snapshot = getMarkPrice(market, outcome, { store, now: options.now });
  const premium = snapshot.indexPrice > 0
    ? (snapshot.markPrice - snapshot.indexPrice) / snapshot.indexPrice
    : 0;

  const interestComponent = clamp(INTEREST_RATE_8H - premium, -PREMIUM_CLAMP, PREMIUM_CLAMP);
  const rawRate = (premium + interestComponent) / 8;
  const rate = clamp(rawRate, -MAX_FUNDING_RATE_HOURLY, MAX_FUNDING_RATE_HOURLY);

  const fundingRate: FundingRate = {
    marketId: market.id,
    outcome,
    rate: Number(rate.toFixed(8)),
    premiumIndex: Number(premium.toFixed(8)),
    markPrice: snapshot.markPrice,
    indexPrice: snapshot.indexPrice,
    timestamp: now.toISOString()
  };

  const key = `${market.id}:${outcome}`;
  const history = store.fundingRates.get(key) ?? [];
  history.push(fundingRate);
  if (history.length > 168) history.splice(0, history.length - 168);
  store.fundingRates.set(key, history);
  persistDerivativesStore(store);

  return fundingRate;
}

/**
 * Settle funding payments for all open positions in a given market + outcome.
 *
 * Returns the array of funding payments made. Call this on a 1-hour tick.
 *
 * Positive rate → longs pay, shorts receive.
 * Negative rate → shorts pay, longs receive.
 */
export function settleFunding(
  market: Market,
  outcome: string,
  options: FundingOptions = {}
): FundingPayment[] {
  const store = getDerivativesStore(options.store);
  const now = (options.now ?? (() => new Date()))();

  const rate = computeFundingRate(market, outcome, options);
  const payments: FundingPayment[] = [];

  const openPositions: PerpetualPosition[] = [];
  for (const p of store.positions.values()) {
    if (p.marketId === market.id && p.outcome === outcome && p.status === "OPEN") {
      openPositions.push(p);
    }
  }

  if (openPositions.length === 0) return payments;

  for (const position of openPositions) {
    const fundingAmount = Number(
      (position.sizeHbar * rate.rate * (position.side === "LONG" ? -1 : 1)).toFixed(8)
    );

    position.fundingAccruedHbar = Number(
      (position.fundingAccruedHbar + fundingAmount).toFixed(8)
    );

    const account = store.margins.get(position.accountId);
    if (account) {
      account.balanceHbar = Number((account.balanceHbar + fundingAmount).toFixed(8));
      if (account.balanceHbar < 0) account.balanceHbar = 0;
    }

    const payment: FundingPayment = {
      id: randomUUID(),
      positionId: position.id,
      marketId: market.id,
      accountId: position.accountId,
      amountHbar: fundingAmount,
      rate: rate.rate,
      timestamp: now.toISOString()
    };

    payments.push(payment);

    const paymentKey = `${market.id}:${position.accountId}`;
    const accountPayments = store.fundingPayments.get(paymentKey) ?? [];
    accountPayments.push(payment);
    store.fundingPayments.set(paymentKey, accountPayments);
  }

  persistDerivativesStore(store);
  return payments;
}

/**
 * Get the funding rate history for a market outcome.
 */
export function getFundingHistory(
  marketId: string,
  outcome: string,
  options: FundingOptions = {}
): FundingRate[] {
  const store = getDerivativesStore(options.store);
  return store.fundingRates.get(`${marketId}:${outcome}`) ?? [];
}

/**
 * Get the latest funding rate, or undefined if none has been computed yet.
 */
export function getLatestFundingRate(
  marketId: string,
  outcome: string,
  options: FundingOptions = {}
): FundingRate | undefined {
  const history = getFundingHistory(marketId, outcome, options);
  return history.length > 0 ? history[history.length - 1] : undefined;
}
