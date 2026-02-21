/**
 * Perpetual positions on market outcome probabilities.
 *
 * Agents go LONG (probability rises → profit) or SHORT (probability falls →
 * profit) with up to 20× leverage. Positions are margined in HBAR and
 * marked-to-market using the pricing oracle.
 *
 * Inspired by Hyperliquid's perpetual model:
 * - Positions never expire (closed explicitly or via liquidation)
 * - Funding rates anchor the perp price to the underlying probability
 * - Liquidation price computed at open, refreshed on mark price updates
 */

import { randomUUID } from "node:crypto";

import { submitMessage, validateNonEmptyString, validatePositiveNumber } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";
import type { Market } from "@simulacrum/markets";

import { computeInitialMargin, computeMaintenanceMargin, lockMargin, releaseMargin } from "./margin.js";
import { computeMarkPrice } from "./pricing.js";
import { getDerivativesStore, persistDerivativesStore, type DerivativesStore } from "./store.js";
import {
  DerivativesError,
  type ClosePositionInput,
  type OpenPositionInput,
  type PerpetualPosition
} from "./types.js";

const MAX_LEVERAGE = 20;
const MIN_LEVERAGE = 1;

export interface PerpetualOptions {
  client?: Client;
  store?: DerivativesStore;
  now?: () => Date;
}

function computeLiquidationPrice(
  entryPrice: number,
  side: "LONG" | "SHORT",
  leverage: number
): number {
  const maintenanceFraction = 1 / (2 * leverage);

  if (side === "LONG") {
    const liqPrice = entryPrice * (1 - (1 / leverage) + maintenanceFraction);
    return Math.max(0.001, Number(liqPrice.toFixed(6)));
  }

  const liqPrice = entryPrice * (1 + (1 / leverage) - maintenanceFraction);
  return Math.min(0.999, Number(liqPrice.toFixed(6)));
}

function computeUnrealizedPnl(
  side: "LONG" | "SHORT",
  sizeHbar: number,
  entryPrice: number,
  markPrice: number
): number {
  const priceDelta = markPrice - entryPrice;
  const direction = side === "LONG" ? 1 : -1;
  return Number((direction * sizeHbar * (priceDelta / entryPrice)).toFixed(8));
}

export function refreshPosition(
  position: PerpetualPosition,
  market: Market,
  options: PerpetualOptions = {}
): PerpetualPosition {
  if (position.status !== "OPEN") return position;

  const snapshot = computeMarkPrice(market, position.outcome, undefined, {
    store: options.store,
    now: options.now
  });

  position.markPrice = snapshot.markPrice;
  position.unrealizedPnlHbar = computeUnrealizedPnl(
    position.side,
    position.sizeHbar,
    position.entryPrice,
    snapshot.markPrice
  );
  position.liquidationPrice = computeLiquidationPrice(
    position.entryPrice,
    position.side,
    position.leverage
  );

  return position;
}

export async function openPosition(
  input: OpenPositionInput,
  market: Market,
  options: PerpetualOptions = {}
): Promise<PerpetualPosition> {
  validateNonEmptyString(input.marketId, "marketId");
  validateNonEmptyString(input.accountId, "accountId");
  validateNonEmptyString(input.outcome, "outcome");
  validatePositiveNumber(input.sizeHbar, "sizeHbar");
  validatePositiveNumber(input.leverage, "leverage");

  if (input.leverage < MIN_LEVERAGE || input.leverage > MAX_LEVERAGE) {
    throw new DerivativesError(
      `Leverage must be between ${MIN_LEVERAGE}× and ${MAX_LEVERAGE}×. Got ${input.leverage}×.`
    );
  }

  if (market.status !== "OPEN") {
    throw new DerivativesError(`Market ${market.id} is not open.`);
  }

  const normalizedOutcome = input.outcome.trim().toUpperCase();
  if (!market.outcomes.includes(normalizedOutcome)) {
    throw new DerivativesError(
      `Invalid outcome "${input.outcome}". Valid: ${market.outcomes.join(", ")}.`
    );
  }

  const store = getDerivativesStore(options.store);
  const now = (options.now ?? (() => new Date()))();
  const marginMode = input.marginMode ?? "CROSS";

  const requiredMargin = computeInitialMargin(input.sizeHbar, input.leverage);

  lockMargin(input.accountId, requiredMargin, { store, now: options.now });

  const snapshot = computeMarkPrice(market, normalizedOutcome, undefined, {
    store,
    now: options.now
  });

  const position: PerpetualPosition = {
    id: randomUUID(),
    marketId: market.id,
    accountId: input.accountId,
    outcome: normalizedOutcome,
    side: input.side,
    sizeHbar: input.sizeHbar,
    entryPrice: snapshot.markPrice,
    markPrice: snapshot.markPrice,
    leverage: input.leverage,
    marginMode,
    marginHbar: requiredMargin,
    unrealizedPnlHbar: 0,
    liquidationPrice: computeLiquidationPrice(snapshot.markPrice, input.side, input.leverage),
    fundingAccruedHbar: 0,
    status: "OPEN",
    openedAt: now.toISOString()
  };

  store.positions.set(position.id, position);
  persistDerivativesStore(store);

  try {
    const audit = await submitMessage(
      market.topicId,
      {
        type: "PERP_POSITION_OPENED",
        positionId: position.id,
        marketId: market.id,
        accountId: input.accountId,
        outcome: normalizedOutcome,
        side: input.side,
        sizeHbar: input.sizeHbar,
        leverage: input.leverage,
        entryPrice: snapshot.markPrice,
        marginHbar: requiredMargin,
        openedAt: position.openedAt
      },
      { client: options.client }
    );
    position.topicTransactionId = audit.transactionId;
    persistDerivativesStore(store);
  } catch {
    // Position is recorded locally even if HCS audit fails
  }

  return position;
}

export async function closePosition(
  input: ClosePositionInput,
  market: Market,
  options: PerpetualOptions = {}
): Promise<PerpetualPosition> {
  validateNonEmptyString(input.positionId, "positionId");
  validateNonEmptyString(input.accountId, "accountId");

  const store = getDerivativesStore(options.store);
  const position = store.positions.get(input.positionId);

  if (!position) {
    throw new DerivativesError(`Position ${input.positionId} not found.`);
  }

  if (position.accountId !== input.accountId) {
    throw new DerivativesError(`Position ${input.positionId} does not belong to ${input.accountId}.`);
  }

  if (position.status !== "OPEN") {
    throw new DerivativesError(`Position ${input.positionId} is not open (status: ${position.status}).`);
  }

  const fraction = input.fraction ?? 1;
  if (fraction <= 0 || fraction > 1) {
    throw new DerivativesError(`Fraction must be in (0, 1]. Got ${fraction}.`);
  }

  const now = (options.now ?? (() => new Date()))();

  refreshPosition(position, market, options);

  const closeSizeHbar = Number((position.sizeHbar * fraction).toFixed(8));
  const closeMarginHbar = Number((position.marginHbar * fraction).toFixed(8));
  const closePnl = Number((position.unrealizedPnlHbar * fraction).toFixed(8));

  releaseMargin(input.accountId, closeMarginHbar, { store, now: options.now });

  const marginAccount = store.margins.get(input.accountId);
  if (marginAccount) {
    marginAccount.balanceHbar = Number(
      (marginAccount.balanceHbar + closePnl).toFixed(8)
    );
    if (marginAccount.balanceHbar < 0) marginAccount.balanceHbar = 0;
  }

  if (fraction >= 1) {
    position.status = "CLOSED";
    position.closedAt = now.toISOString();
    position.realizedPnlHbar = closePnl;
  } else {
    position.sizeHbar = Number((position.sizeHbar - closeSizeHbar).toFixed(8));
    position.marginHbar = Number((position.marginHbar - closeMarginHbar).toFixed(8));
    position.realizedPnlHbar = Number(
      ((position.realizedPnlHbar ?? 0) + closePnl).toFixed(8)
    );
  }

  persistDerivativesStore(store);

  try {
    await submitMessage(
      market.topicId,
      {
        type: "PERP_POSITION_CLOSED",
        positionId: position.id,
        marketId: market.id,
        accountId: input.accountId,
        fraction,
        closeSizeHbar,
        realizedPnlHbar: closePnl,
        markPrice: position.markPrice,
        closedAt: now.toISOString()
      },
      { client: options.client }
    );
  } catch {
    // Audit best-effort
  }

  return position;
}

export function getPosition(
  positionId: string,
  options: PerpetualOptions = {}
): PerpetualPosition | undefined {
  const store = getDerivativesStore(options.store);
  return store.positions.get(positionId);
}

export function getPositionsForAccount(
  accountId: string,
  options: PerpetualOptions & { status?: "OPEN" | "CLOSED" | "LIQUIDATED" } = {}
): PerpetualPosition[] {
  const store = getDerivativesStore(options.store);
  const all = Array.from(store.positions.values()).filter(
    (p) => p.accountId === accountId
  );
  if (options.status) {
    return all.filter((p) => p.status === options.status);
  }
  return all;
}

export function getPositionsForMarket(
  marketId: string,
  options: PerpetualOptions & { status?: "OPEN" | "CLOSED" | "LIQUIDATED" } = {}
): PerpetualPosition[] {
  const store = getDerivativesStore(options.store);
  const all = Array.from(store.positions.values()).filter(
    (p) => p.marketId === marketId
  );
  if (options.status) {
    return all.filter((p) => p.status === options.status);
  }
  return all;
}

export function getOpenInterest(
  marketId: string,
  options: PerpetualOptions = {}
): { totalLongHbar: number; totalShortHbar: number; netHbar: number } {
  const store = getDerivativesStore(options.store);
  let totalLong = 0;
  let totalShort = 0;

  for (const p of store.positions.values()) {
    if (p.marketId === marketId && p.status === "OPEN") {
      if (p.side === "LONG") totalLong += p.sizeHbar;
      else totalShort += p.sizeHbar;
    }
  }

  return {
    totalLongHbar: Number(totalLong.toFixed(8)),
    totalShortHbar: Number(totalShort.toFixed(8)),
    netHbar: Number((totalLong - totalShort).toFixed(8))
  };
}
