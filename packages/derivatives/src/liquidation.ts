/**
 * Three-tier cascading liquidation engine (Hyperliquid model).
 *
 * Tier 1 — Market Close: close the position at current mark price.
 *   Remaining collateral returns to the agent.
 *
 * Tier 2 — Insurance Fund Backstop: if closing at market leaves a deficit,
 *   the insurance fund absorbs the loss. If the fund is insufficient, the
 *   loss is socialized in Tier 3.
 *
 * Tier 3 — Auto-Deleverage (ADL): the most profitable opposing positions
 *   are partially closed to cover the remaining deficit. Ranked by
 *   (unrealized PnL × leverage) descending.
 *
 * For positions > 100 HBAR notional: only 20% liquidated initially, then a
 * cooldown period before targeting the remainder (Hyperliquid's partial
 * liquidation pattern).
 */

import { randomUUID } from "node:crypto";

import type { Market } from "@simulacrum/markets";

import { computeMaintenanceMargin, getEffectiveEquity, releaseMargin } from "./margin.js";
import { refreshPosition } from "./perpetual.js";
import { getDerivativesStore, persistDerivativesStore, type DerivativesStore } from "./store.js";
import type { LiquidationEvent, PerpetualPosition } from "./types.js";

const PARTIAL_LIQUIDATION_THRESHOLD_HBAR = 100;
const PARTIAL_LIQUIDATION_FRACTION = 0.2;

export interface LiquidationOptions {
  store?: DerivativesStore;
  now?: () => Date;
}

function isUnderwater(position: PerpetualPosition, store: DerivativesStore): boolean {
  const maintenanceMargin = computeMaintenanceMargin(position.sizeHbar, position.leverage);

  if (position.marginMode === "ISOLATED") {
    return (position.marginHbar + position.unrealizedPnlHbar) < maintenanceMargin;
  }

  const equity = getEffectiveEquity(position.accountId, { store });
  return equity < maintenanceMargin;
}

function executeTier1(
  position: PerpetualPosition,
  store: DerivativesStore,
  now: Date,
  fraction: number
): LiquidationEvent {
  const closeSize = Number((position.sizeHbar * fraction).toFixed(8));
  const closeMargin = Number((position.marginHbar * fraction).toFixed(8));
  const closePnl = Number((position.unrealizedPnlHbar * fraction).toFixed(8));

  const loss = closePnl < 0 ? Math.abs(closePnl) : 0;
  const returnToAgent = Math.max(0, closeMargin + closePnl);

  releaseMargin(position.accountId, closeMargin, { store });

  const account = store.margins.get(position.accountId);
  if (account && returnToAgent > 0) {
    account.balanceHbar = Number((account.balanceHbar + returnToAgent - closeMargin).toFixed(8));
    if (account.balanceHbar < 0) account.balanceHbar = 0;
  }

  if (fraction >= 1) {
    position.status = "LIQUIDATED";
    position.closedAt = now.toISOString();
    position.realizedPnlHbar = closePnl;
  } else {
    position.sizeHbar = Number((position.sizeHbar - closeSize).toFixed(8));
    position.marginHbar = Number((position.marginHbar - closeMargin).toFixed(8));
  }

  const event: LiquidationEvent = {
    id: randomUUID(),
    positionId: position.id,
    marketId: position.marketId,
    accountId: position.accountId,
    tier: 1,
    sizeHbar: closeSize,
    lossHbar: loss,
    insuranceFundDelta: 0,
    timestamp: now.toISOString()
  };

  return event;
}

function executeTier2(
  deficit: number,
  store: DerivativesStore,
  event: LiquidationEvent
): number {
  const fund = store.insuranceFund;
  const absorbed = Math.min(deficit, fund.balanceHbar);

  fund.balanceHbar = Number((fund.balanceHbar - absorbed).toFixed(8));
  fund.totalPayouts = Number((fund.totalPayouts + absorbed).toFixed(8));

  event.tier = 2;
  event.insuranceFundDelta = -absorbed;

  return Number((deficit - absorbed).toFixed(8));
}

function executeTier3(
  deficit: number,
  position: PerpetualPosition,
  store: DerivativesStore,
  now: Date
): LiquidationEvent[] {
  const adlEvents: LiquidationEvent[] = [];
  if (deficit <= 0) return adlEvents;

  const oppositeSide = position.side === "LONG" ? "SHORT" : "LONG";
  const candidates = Array.from(store.positions.values())
    .filter(
      (p) =>
        p.marketId === position.marketId &&
        p.outcome === position.outcome &&
        p.side === oppositeSide &&
        p.status === "OPEN" &&
        p.unrealizedPnlHbar > 0
    )
    .sort((a, b) => {
      const scoreA = a.unrealizedPnlHbar * a.leverage;
      const scoreB = b.unrealizedPnlHbar * b.leverage;
      return scoreB - scoreA;
    });

  let remaining = deficit;

  for (const candidate of candidates) {
    if (remaining <= 0) break;

    const maxTake = Math.min(remaining, candidate.unrealizedPnlHbar);
    const fraction = maxTake / (candidate.sizeHbar * (candidate.markPrice - candidate.entryPrice) / candidate.entryPrice || 1);
    const adlFraction = Math.min(1, Math.max(0.01, fraction));

    const adlSize = Number((candidate.sizeHbar * adlFraction).toFixed(8));
    const adlMargin = Number((candidate.marginHbar * adlFraction).toFixed(8));

    candidate.sizeHbar = Number((candidate.sizeHbar - adlSize).toFixed(8));
    candidate.marginHbar = Number((candidate.marginHbar - adlMargin).toFixed(8));

    if (candidate.sizeHbar <= 0.0001) {
      candidate.status = "CLOSED";
      candidate.closedAt = now.toISOString();
    }

    releaseMargin(candidate.accountId, adlMargin, { store });

    const account = store.margins.get(candidate.accountId);
    if (account) {
      account.balanceHbar = Number(
        (account.balanceHbar + adlMargin - maxTake).toFixed(8)
      );
      if (account.balanceHbar < 0) account.balanceHbar = 0;
    }

    remaining = Number((remaining - maxTake).toFixed(8));

    adlEvents.push({
      id: randomUUID(),
      positionId: candidate.id,
      marketId: candidate.marketId,
      accountId: candidate.accountId,
      tier: 3,
      sizeHbar: adlSize,
      lossHbar: maxTake,
      insuranceFundDelta: 0,
      timestamp: now.toISOString()
    });
  }

  return adlEvents;
}

/**
 * Check and liquidate a single position if it's underwater.
 * Returns the liquidation events produced (empty if position is healthy).
 */
export function liquidatePosition(
  position: PerpetualPosition,
  market: Market,
  options: LiquidationOptions = {}
): LiquidationEvent[] {
  const store = getDerivativesStore(options.store);
  const now = (options.now ?? (() => new Date()))();

  refreshPosition(position, market, { store, now: options.now });

  if (!isUnderwater(position, store)) return [];

  const fraction = position.sizeHbar > PARTIAL_LIQUIDATION_THRESHOLD_HBAR
    ? PARTIAL_LIQUIDATION_FRACTION
    : 1;

  const tier1Event = executeTier1(position, store, now, fraction);
  const events: LiquidationEvent[] = [tier1Event];

  if (tier1Event.lossHbar > position.marginHbar * fraction) {
    const deficit = Number(
      (tier1Event.lossHbar - position.marginHbar * fraction).toFixed(8)
    );

    const remaining = executeTier2(deficit, store, tier1Event);

    if (remaining > 0) {
      const adlEvents = executeTier3(remaining, position, store, now);
      events.push(...adlEvents);
    }
  }

  store.liquidations.push(...events);
  persistDerivativesStore(store);

  return events;
}

/**
 * Sweep all open positions for a market and liquidate any that are underwater.
 * Call this on every price update tick.
 */
export function sweepLiquidations(
  market: Market,
  options: LiquidationOptions = {}
): LiquidationEvent[] {
  const store = getDerivativesStore(options.store);
  const allEvents: LiquidationEvent[] = [];

  for (const position of store.positions.values()) {
    if (position.marketId !== market.id || position.status !== "OPEN") continue;

    const events = liquidatePosition(position, market, options);
    allEvents.push(...events);
  }

  return allEvents;
}

/**
 * Deposit HBAR into the insurance fund. Can be called by the platform or
 * funded from trading fees.
 */
export function depositInsuranceFund(
  amountHbar: number,
  options: LiquidationOptions = {}
): void {
  const store = getDerivativesStore(options.store);
  const now = (options.now ?? (() => new Date()))();

  store.insuranceFund.balanceHbar = Number(
    (store.insuranceFund.balanceHbar + amountHbar).toFixed(8)
  );
  store.insuranceFund.totalDeposits = Number(
    (store.insuranceFund.totalDeposits + amountHbar).toFixed(8)
  );
  store.insuranceFund.updatedAt = now.toISOString();

  persistDerivativesStore(store);
}

export function getInsuranceFund(options: LiquidationOptions = {}): { balanceHbar: number; totalDeposits: number; totalPayouts: number } {
  const store = getDerivativesStore(options.store);
  return {
    balanceHbar: store.insuranceFund.balanceHbar,
    totalDeposits: store.insuranceFund.totalDeposits,
    totalPayouts: store.insuranceFund.totalPayouts
  };
}

export function getRecentLiquidations(
  limit = 50,
  options: LiquidationOptions = {}
): LiquidationEvent[] {
  const store = getDerivativesStore(options.store);
  return store.liquidations.slice(-limit);
}
