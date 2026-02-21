/**
 * Options contracts on market outcome probabilities.
 *
 * CALL = right to profit if the outcome probability exceeds the strike price
 * PUT  = right to profit if the outcome probability falls below the strike
 *
 * European-style by default (exercise only at/after expiry). Cash-settled in
 * HBAR. Option writers post collateral equal to max possible payout.
 *
 * Premium pricing uses a simplified Black-Scholes adapted for probability
 * markets where the underlying is bounded [0, 1].
 */

import { randomUUID } from "node:crypto";

import { submitMessage, validateNonEmptyString, validatePositiveNumber } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";
import type { Market } from "@simulacrum/markets";

import { lockMargin, releaseMargin } from "./margin.js";
import { computeMarkPrice, getMarkPrice } from "./pricing.js";
import { getDerivativesStore, persistDerivativesStore, type DerivativesStore } from "./store.js";
import {
  DerivativesError,
  type BuyOptionInput,
  type ExerciseOptionInput,
  type OptionContract,
  type WriteOptionInput
} from "./types.js";

export interface OptionsOperationOptions {
  client?: Client;
  store?: DerivativesStore;
  now?: () => Date;
}

function normalCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Simplified Black-Scholes for probability-space options.
 *
 * Instead of log-normal price dynamics, we use a logit-normal model where the
 * underlying probability is transformed via logit(p) = ln(p/(1-p)), giving
 * unbounded support for standard B-S formulas.
 */
export function estimateOptionPremium(
  currentPrice: number,
  strikePrice: number,
  timeToExpiryDays: number,
  optionType: "CALL" | "PUT",
  volatility = 0.5
): number {
  const S = Math.max(0.001, Math.min(0.999, currentPrice));
  const K = Math.max(0.001, Math.min(0.999, strikePrice));
  const T = Math.max(0.001, timeToExpiryDays / 365);
  const sigma = volatility;

  const logitS = Math.log(S / (1 - S));
  const logitK = Math.log(K / (1 - K));

  const d1 = (logitS - logitK + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  if (optionType === "CALL") {
    return Number((S * normalCdf(d1) - K * normalCdf(d2)).toFixed(8));
  }

  return Number((K * normalCdf(-d2) - S * normalCdf(-d1)).toFixed(8));
}

/**
 * Write (create) an option contract. Writer posts collateral.
 */
export async function writeOption(
  input: WriteOptionInput,
  market: Market,
  options: OptionsOperationOptions = {}
): Promise<OptionContract> {
  validateNonEmptyString(input.marketId, "marketId");
  validateNonEmptyString(input.outcome, "outcome");
  validateNonEmptyString(input.writerAccountId, "writerAccountId");
  validatePositiveNumber(input.sizeHbar, "sizeHbar");
  validatePositiveNumber(input.premiumHbar, "premiumHbar");

  if (input.strikePrice <= 0 || input.strikePrice >= 1) {
    throw new DerivativesError(`Strike price must be in (0, 1). Got ${input.strikePrice}.`);
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

  const expiresAt = input.expiresAt ?? market.closeTime;
  if (Date.parse(expiresAt) <= now.getTime()) {
    throw new DerivativesError(`Option expiry must be in the future.`);
  }

  const collateralHbar = input.sizeHbar;
  lockMargin(input.writerAccountId, collateralHbar, { store, now: options.now });

  const contract: OptionContract = {
    id: randomUUID(),
    marketId: market.id,
    outcome: normalizedOutcome,
    optionType: input.optionType,
    style: input.style ?? "EUROPEAN",
    strikePrice: input.strikePrice,
    premiumHbar: input.premiumHbar,
    sizeHbar: input.sizeHbar,
    expiresAt,
    writerAccountId: input.writerAccountId,
    holderAccountId: "",
    collateralHbar,
    status: "ACTIVE",
    createdAt: now.toISOString()
  };

  store.options.set(contract.id, contract);
  persistDerivativesStore(store);

  try {
    const audit = await submitMessage(
      market.topicId,
      {
        type: "OPTION_WRITTEN",
        optionId: contract.id,
        marketId: market.id,
        outcome: normalizedOutcome,
        optionType: input.optionType,
        strikePrice: input.strikePrice,
        sizeHbar: input.sizeHbar,
        premiumHbar: input.premiumHbar,
        writerAccountId: input.writerAccountId,
        expiresAt,
        createdAt: contract.createdAt
      },
      { client: options.client }
    );
    contract.topicTransactionId = audit.transactionId;
    persistDerivativesStore(store);
  } catch {
    // Audit best-effort
  }

  return contract;
}

/**
 * Buy an existing option contract. Buyer pays the premium.
 */
export async function buyOption(
  input: BuyOptionInput,
  options: OptionsOperationOptions = {}
): Promise<OptionContract> {
  validateNonEmptyString(input.optionId, "optionId");
  validateNonEmptyString(input.holderAccountId, "holderAccountId");

  const store = getDerivativesStore(options.store);
  const contract = store.options.get(input.optionId);

  if (!contract) {
    throw new DerivativesError(`Option ${input.optionId} not found.`);
  }

  if (contract.status !== "ACTIVE" || contract.holderAccountId !== "") {
    throw new DerivativesError(`Option ${input.optionId} is not available for purchase.`);
  }

  if (contract.writerAccountId === input.holderAccountId) {
    throw new DerivativesError(`Writer cannot buy their own option.`);
  }

  const now = (options.now ?? (() => new Date()))();
  if (Date.parse(contract.expiresAt) <= now.getTime()) {
    contract.status = "EXPIRED";
    persistDerivativesStore(store);
    throw new DerivativesError(`Option ${input.optionId} has expired.`);
  }

  const buyerAccount = store.margins.get(input.holderAccountId);
  if (!buyerAccount || buyerAccount.balanceHbar - buyerAccount.lockedHbar < contract.premiumHbar) {
    throw new DerivativesError(
      `Insufficient margin to pay premium of ${contract.premiumHbar} HBAR.`
    );
  }

  buyerAccount.balanceHbar = Number(
    (buyerAccount.balanceHbar - contract.premiumHbar).toFixed(8)
  );

  const writerAccount = store.margins.get(contract.writerAccountId);
  if (writerAccount) {
    writerAccount.balanceHbar = Number(
      (writerAccount.balanceHbar + contract.premiumHbar).toFixed(8)
    );
  }

  contract.holderAccountId = input.holderAccountId;
  persistDerivativesStore(store);

  return contract;
}

/**
 * Exercise an option at/after expiry (European) or any time (American).
 * Cash-settled: if ITM, holder receives (current_price - strike) * size for
 * calls, or (strike - current_price) * size for puts.
 */
export async function exerciseOption(
  input: ExerciseOptionInput,
  market: Market,
  options: OptionsOperationOptions = {}
): Promise<OptionContract> {
  validateNonEmptyString(input.optionId, "optionId");
  validateNonEmptyString(input.holderAccountId, "holderAccountId");

  const store = getDerivativesStore(options.store);
  const contract = store.options.get(input.optionId);

  if (!contract) {
    throw new DerivativesError(`Option ${input.optionId} not found.`);
  }

  if (contract.holderAccountId !== input.holderAccountId) {
    throw new DerivativesError(`Only the option holder can exercise.`);
  }

  if (contract.status !== "ACTIVE") {
    throw new DerivativesError(`Option ${input.optionId} is not exercisable (status: ${contract.status}).`);
  }

  const now = (options.now ?? (() => new Date()))();

  if (contract.style === "EUROPEAN" && Date.parse(contract.expiresAt) > now.getTime()) {
    throw new DerivativesError(
      `European option cannot be exercised before expiry (${contract.expiresAt}).`
    );
  }

  const snapshot = getMarkPrice(market, contract.outcome, { store, now: options.now });
  const currentPrice = snapshot.markPrice;

  let payoff: number;
  if (contract.optionType === "CALL") {
    payoff = Math.max(0, currentPrice - contract.strikePrice) * contract.sizeHbar;
  } else {
    payoff = Math.max(0, contract.strikePrice - currentPrice) * contract.sizeHbar;
  }

  payoff = Number(payoff.toFixed(8));
  const writerReturn = Number((contract.collateralHbar - payoff).toFixed(8));

  releaseMargin(contract.writerAccountId, contract.collateralHbar, { store, now: options.now });

  const holderAccount = store.margins.get(contract.holderAccountId);
  if (holderAccount && payoff > 0) {
    holderAccount.balanceHbar = Number((holderAccount.balanceHbar + payoff).toFixed(8));
  }

  const writerAccount = store.margins.get(contract.writerAccountId);
  if (writerAccount && writerReturn > 0) {
    writerAccount.balanceHbar = Number((writerAccount.balanceHbar + writerReturn).toFixed(8));
  }

  contract.status = "EXERCISED";
  contract.exercisedAt = now.toISOString();
  contract.settlementHbar = payoff;

  persistDerivativesStore(store);

  try {
    await submitMessage(
      market.topicId,
      {
        type: "OPTION_EXERCISED",
        optionId: contract.id,
        marketId: market.id,
        holderAccountId: input.holderAccountId,
        writerAccountId: contract.writerAccountId,
        currentPrice,
        strikePrice: contract.strikePrice,
        payoffHbar: payoff,
        exercisedAt: contract.exercisedAt
      },
      { client: options.client }
    );
  } catch {
    // Audit best-effort
  }

  return contract;
}

/**
 * Expire all options past their expiry date. Returns contracts that were
 * expired. Writer collateral is released for unexercised options.
 */
export function expireOptions(
  options: OptionsOperationOptions = {}
): OptionContract[] {
  const store = getDerivativesStore(options.store);
  const now = (options.now ?? (() => new Date()))();
  const expired: OptionContract[] = [];

  for (const contract of store.options.values()) {
    if (contract.status !== "ACTIVE") continue;
    if (Date.parse(contract.expiresAt) > now.getTime()) continue;

    contract.status = "EXPIRED";

    releaseMargin(contract.writerAccountId, contract.collateralHbar, { store, now: options.now });

    expired.push(contract);
  }

  if (expired.length > 0) {
    persistDerivativesStore(store);
  }

  return expired;
}

/**
 * Reprice a single active option using the logit-normal Black-Scholes model
 * and the current mark price oracle.  Updates all mark-to-market fields on the
 * contract and persists the result.
 *
 * This is the options analogue of `refreshPosition()` for perpetuals.
 */
export function refreshOption(
  contract: OptionContract,
  market: Market,
  options: OptionsOperationOptions = {}
): OptionContract {
  if (contract.status !== "ACTIVE") return contract;

  const store = getDerivativesStore(options.store);
  const now = (options.now ?? (() => new Date()))();

  const expiryMs = Date.parse(contract.expiresAt);
  const remainingMs = expiryMs - now.getTime();

  if (remainingMs <= 0) {
    return contract;
  }

  const snapshot = computeMarkPrice(market, contract.outcome, undefined, {
    store,
    now: options.now
  });

  const timeToExpiryDays = remainingMs / 86_400_000;

  const currentPremium = Math.max(
    0,
    estimateOptionPremium(
      snapshot.markPrice,
      contract.strikePrice,
      timeToExpiryDays,
      contract.optionType
    )
  );

  const currentPremiumHbar = Number((currentPremium * contract.sizeHbar).toFixed(8));

  contract.currentPremiumHbar = currentPremiumHbar;
  contract.currentMarkPrice = snapshot.markPrice;
  contract.timeToExpiryDays = Number(timeToExpiryDays.toFixed(4));
  contract.lastRefreshedAt = now.toISOString();

  if (contract.holderAccountId) {
    contract.holderPnlHbar = Number((currentPremiumHbar - contract.premiumHbar).toFixed(8));
    contract.writerPnlHbar = Number((contract.premiumHbar - currentPremiumHbar).toFixed(8));
  } else {
    contract.holderPnlHbar = undefined;
    contract.writerPnlHbar = undefined;
  }

  return contract;
}

/**
 * Refresh mark-to-market on all active options for a given market.
 * Returns the list of contracts that were repriced.
 */
export function refreshAllOptions(
  market: Market,
  options: OptionsOperationOptions = {}
): OptionContract[] {
  const store = getDerivativesStore(options.store);
  const refreshed: OptionContract[] = [];

  for (const contract of store.options.values()) {
    if (contract.marketId !== market.id) continue;
    if (contract.status !== "ACTIVE") continue;

    refreshOption(contract, market, options);
    refreshed.push(contract);
  }

  if (refreshed.length > 0) {
    persistDerivativesStore(store);
  }

  return refreshed;
}

export function getOption(
  optionId: string,
  options: OptionsOperationOptions = {}
): OptionContract | undefined {
  const store = getDerivativesStore(options.store);
  return store.options.get(optionId);
}

export function getOptionsForMarket(
  marketId: string,
  options: OptionsOperationOptions = {}
): OptionContract[] {
  const store = getDerivativesStore(options.store);
  return Array.from(store.options.values()).filter((o) => o.marketId === marketId);
}

export function getAvailableOptions(
  marketId: string,
  options: OptionsOperationOptions = {}
): OptionContract[] {
  const store = getDerivativesStore(options.store);
  return Array.from(store.options.values()).filter(
    (o) => o.marketId === marketId && o.status === "ACTIVE" && o.holderAccountId === ""
  );
}
