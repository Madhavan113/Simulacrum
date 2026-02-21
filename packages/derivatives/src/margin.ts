/**
 * Margin account management — deposit, withdraw, lock, and release collateral.
 *
 * Cross margin: all positions share a single margin pool.
 * Isolated margin: each position has its own locked margin.
 */

import { randomUUID } from "node:crypto";

import { validateNonEmptyString, validatePositiveNumber } from "@simulacrum/core";

import { getDerivativesStore, persistDerivativesStore, type DerivativesStore } from "./store.js";
import {
  DerivativesError,
  type DepositMarginInput,
  type MarginAccount,
  type MarginMode,
  type WithdrawMarginInput
} from "./types.js";

export interface MarginOptions {
  store?: DerivativesStore;
  now?: () => Date;
}

function getOrCreateAccount(
  store: DerivativesStore,
  accountId: string,
  mode: MarginMode,
  now: Date
): MarginAccount {
  const existing = store.margins.get(accountId);
  if (existing) return existing;

  const account: MarginAccount = {
    id: randomUUID(),
    accountId,
    balanceHbar: 0,
    lockedHbar: 0,
    mode,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  store.margins.set(accountId, account);
  return account;
}

export function depositMargin(
  input: DepositMarginInput,
  options: MarginOptions = {}
): MarginAccount {
  validateNonEmptyString(input.accountId, "accountId");
  validatePositiveNumber(input.amountHbar, "amountHbar");

  const store = getDerivativesStore(options.store);
  const now = (options.now ?? (() => new Date()))();
  const account = getOrCreateAccount(store, input.accountId, input.mode ?? "CROSS", now);

  account.balanceHbar = Number((account.balanceHbar + input.amountHbar).toFixed(8));
  account.updatedAt = now.toISOString();

  if (input.mode && input.mode !== account.mode) {
    const hasOpenPositions = Array.from(store.positions.values()).some(
      (p) => p.accountId === input.accountId && p.status === "OPEN"
    );
    if (hasOpenPositions) {
      throw new DerivativesError(
        `Cannot switch margin mode while positions are open. Close all positions first.`
      );
    }
    account.mode = input.mode;
  }

  persistDerivativesStore(store);
  return account;
}

export function withdrawMargin(
  input: WithdrawMarginInput,
  options: MarginOptions = {}
): MarginAccount {
  validateNonEmptyString(input.accountId, "accountId");
  validatePositiveNumber(input.amountHbar, "amountHbar");

  const store = getDerivativesStore(options.store);
  const account = store.margins.get(input.accountId);

  if (!account) {
    throw new DerivativesError(`No margin account found for ${input.accountId}.`);
  }

  const available = account.balanceHbar - account.lockedHbar;
  if (input.amountHbar > available + 0.000001) {
    throw new DerivativesError(
      `Insufficient available margin. Requested ${input.amountHbar} HBAR but only ${available.toFixed(8)} HBAR is available ` +
      `(${account.balanceHbar.toFixed(8)} balance - ${account.lockedHbar.toFixed(8)} locked).`
    );
  }

  account.balanceHbar = Number(Math.max(0, account.balanceHbar - input.amountHbar).toFixed(8));
  account.updatedAt = (options.now ?? (() => new Date()))().toISOString();

  persistDerivativesStore(store);
  return account;
}

export function getMarginAccount(
  accountId: string,
  options: MarginOptions = {}
): MarginAccount | undefined {
  const store = getDerivativesStore(options.store);
  return store.margins.get(accountId);
}

export function lockMargin(
  accountId: string,
  amountHbar: number,
  options: MarginOptions = {}
): void {
  const store = getDerivativesStore(options.store);
  const account = store.margins.get(accountId);

  if (!account) {
    throw new DerivativesError(`No margin account found for ${accountId}.`);
  }

  const available = account.balanceHbar - account.lockedHbar;
  if (amountHbar > available + 0.000001) {
    throw new DerivativesError(
      `Insufficient margin for lock. Need ${amountHbar} HBAR, available ${available.toFixed(8)} HBAR.`
    );
  }

  account.lockedHbar = Number((account.lockedHbar + amountHbar).toFixed(8));
  account.updatedAt = (options.now ?? (() => new Date()))().toISOString();
  persistDerivativesStore(store);
}

export function releaseMargin(
  accountId: string,
  amountHbar: number,
  options: MarginOptions = {}
): void {
  const store = getDerivativesStore(options.store);
  const account = store.margins.get(accountId);

  if (!account) {
    throw new DerivativesError(`No margin account found for ${accountId}.`);
  }

  account.lockedHbar = Number(Math.max(0, account.lockedHbar - amountHbar).toFixed(8));
  account.updatedAt = (options.now ?? (() => new Date()))().toISOString();
  persistDerivativesStore(store);
}

/**
 * Compute the effective equity for an account (balance + unrealized PnL from
 * all open cross-margin positions).
 */
export function getEffectiveEquity(
  accountId: string,
  options: MarginOptions = {}
): number {
  const store = getDerivativesStore(options.store);
  const account = store.margins.get(accountId);
  if (!account) return 0;

  let unrealizedPnl = 0;
  for (const position of store.positions.values()) {
    if (
      position.accountId === accountId &&
      position.status === "OPEN" &&
      position.marginMode === "CROSS"
    ) {
      unrealizedPnl += position.unrealizedPnlHbar;
    }
  }

  return Number((account.balanceHbar + unrealizedPnl).toFixed(8));
}

/**
 * Compute required initial margin for a new position.
 * Initial margin = notional / leverage.
 */
export function computeInitialMargin(sizeHbar: number, leverage: number): number {
  return Number((sizeHbar / leverage).toFixed(8));
}

/**
 * Compute maintenance margin.
 * Maintenance = 50% of max initial margin (i.e., notional / (2 * max_leverage)).
 * For simplicity we use 50% of the position's initial margin.
 */
export function computeMaintenanceMargin(sizeHbar: number, leverage: number): number {
  return Number((sizeHbar / leverage / 2).toFixed(8));
}
