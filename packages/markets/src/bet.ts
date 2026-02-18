import { randomUUID } from "node:crypto";

import { submitMessage, transferHbar, validateNonEmptyString, validatePositiveNumber } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";

import { getMarketStore, persistMarketStore, type MarketStore } from "./store.js";
import { type Market, type MarketBet, MarketError, type PlaceBetInput } from "./types.js";

interface PlaceBetDependencies {
  transferHbar: typeof transferHbar;
  submitMessage: typeof submitMessage;
  now: () => Date;
}

export interface PlaceBetOptions {
  client?: Client;
  store?: MarketStore;
  deps?: Partial<PlaceBetDependencies>;
}

const DEFAULT_CURVE_LIQUIDITY_HBAR = 25;

interface CurveStateSnapshot {
  liquidityParameterHbar: number;
  sharesByOutcome: Record<string, number>;
}

interface CurveTradeQuote {
  liquidityParameterHbar: number;
  sharesPurchased: number;
  preTradeOdds: number;
  nextSharesByOutcome: Record<string, number>;
  nextOddsByOutcome: Record<string, number>;
}

function fallbackOdds(outcomes: readonly string[]): Record<string, number> {
  const base = Number((100 / outcomes.length).toFixed(2));
  const odds: Record<string, number> = {};
  let running = 0;

  for (let index = 0; index < outcomes.length; index += 1) {
    const outcome = outcomes[index];

    if (!outcome) {
      continue;
    }

    if (index === outcomes.length - 1) {
      odds[outcome] = Number((100 - running).toFixed(2));
      continue;
    }

    odds[outcome] = base;
    running += base;
  }

  return odds;
}

function normalizeProbabilities(
  oddsByOutcome: Record<string, number>,
  outcomes: readonly string[]
): Record<string, number> {
  const normalized: Record<string, number> = {};
  let total = 0;

  for (const outcome of outcomes) {
    const raw = oddsByOutcome[outcome];
    const probability = Number.isFinite(raw) && raw > 0 ? raw / 100 : 0;
    normalized[outcome] = probability;
    total += probability;
  }

  if (total <= 0) {
    const uniform = 1 / outcomes.length;
    for (const outcome of outcomes) {
      normalized[outcome] = uniform;
    }
    return normalized;
  }

  for (const outcome of outcomes) {
    normalized[outcome] = normalized[outcome] / total;
  }

  return normalized;
}

function logSumExp(values: readonly number[]): number {
  const max = Math.max(...values);
  const sum = values.reduce((acc, value) => acc + Math.exp(value - max), 0);
  return max + Math.log(sum);
}

function computeCurveCost(
  outcomes: readonly string[],
  sharesByOutcome: Record<string, number>,
  liquidityParameterHbar: number
): number {
  const scaled = outcomes.map((outcome) => (sharesByOutcome[outcome] ?? 0) / liquidityParameterHbar);
  return liquidityParameterHbar * logSumExp(scaled);
}

function computeCurveProbabilities(
  outcomes: readonly string[],
  sharesByOutcome: Record<string, number>,
  liquidityParameterHbar: number
): Record<string, number> {
  const scaled = outcomes.map((outcome) => (sharesByOutcome[outcome] ?? 0) / liquidityParameterHbar);
  const max = Math.max(...scaled);
  const weights = scaled.map((value) => Math.exp(value - max));
  const total = weights.reduce((sum, value) => sum + value, 0);
  const probabilities: Record<string, number> = {};

  for (let index = 0; index < outcomes.length; index += 1) {
    const outcome = outcomes[index];

    if (!outcome) {
      continue;
    }

    probabilities[outcome] = total > 0 ? weights[index] / total : 1 / outcomes.length;
  }

  return probabilities;
}

function toOddsPercentages(
  probabilities: Record<string, number>,
  outcomes: readonly string[]
): Record<string, number> {
  const odds: Record<string, number> = {};
  let running = 0;

  for (let index = 0; index < outcomes.length; index += 1) {
    const outcome = outcomes[index];

    if (!outcome) {
      continue;
    }

    if (index === outcomes.length - 1) {
      odds[outcome] = Number((100 - running).toFixed(2));
      continue;
    }

    const raw = Number(((probabilities[outcome] ?? 0) * 100).toFixed(2));
    odds[outcome] = raw;
    running += raw;
  }

  return odds;
}

function ensureCurveState(market: Market): CurveStateSnapshot {
  const liquidityParameterHbar =
    market.curveState?.liquidityParameterHbar && market.curveState.liquidityParameterHbar > 0
      ? market.curveState.liquidityParameterHbar
      : DEFAULT_CURVE_LIQUIDITY_HBAR;

  if (market.curveState?.sharesByOutcome) {
    const hydrated: Record<string, number> = {};
    for (const outcome of market.outcomes) {
      hydrated[outcome] = Number.isFinite(market.curveState.sharesByOutcome[outcome])
        ? market.curveState.sharesByOutcome[outcome] ?? 0
        : 0;
    }
    return {
      liquidityParameterHbar,
      sharesByOutcome: hydrated
    };
  }

  const seedOdds = market.currentOddsByOutcome ?? market.initialOddsByOutcome ?? fallbackOdds(market.outcomes);
  const probabilities = normalizeProbabilities(seedOdds, market.outcomes);
  const sharesByOutcome: Record<string, number> = {};

  for (const outcome of market.outcomes) {
    const probability = Math.max(0.0001, probabilities[outcome] ?? 0.0001);
    sharesByOutcome[outcome] = Number((liquidityParameterHbar * Math.log(probability)).toFixed(8));
  }

  return {
    liquidityParameterHbar,
    sharesByOutcome
  };
}

function solveSharesForCost(
  outcomes: readonly string[],
  sharesByOutcome: Record<string, number>,
  outcome: string,
  liquidityParameterHbar: number,
  amountHbar: number
): number {
  const baseCost = computeCurveCost(outcomes, sharesByOutcome, liquidityParameterHbar);
  const costDelta = (shares: number): number => {
    const nextShares = {
      ...sharesByOutcome,
      [outcome]: (sharesByOutcome[outcome] ?? 0) + shares
    };
    return computeCurveCost(outcomes, nextShares, liquidityParameterHbar) - baseCost;
  };

  let lower = 0;
  let upper = Math.max(amountHbar, 1);

  while (costDelta(upper) < amountHbar && upper < 1_000_000) {
    upper *= 2;
  }

  for (let iteration = 0; iteration < 60; iteration += 1) {
    const midpoint = (lower + upper) / 2;

    if (costDelta(midpoint) >= amountHbar) {
      upper = midpoint;
    } else {
      lower = midpoint;
    }
  }

  return Number(upper.toFixed(8));
}

function quoteCurveTrade(market: Market, outcome: string, amountHbar: number): CurveTradeQuote {
  const curveState = ensureCurveState(market);
  const preTradeProbabilities = computeCurveProbabilities(
    market.outcomes,
    curveState.sharesByOutcome,
    curveState.liquidityParameterHbar
  );
  const sharesPurchased = solveSharesForCost(
    market.outcomes,
    curveState.sharesByOutcome,
    outcome,
    curveState.liquidityParameterHbar,
    amountHbar
  );
  const nextSharesByOutcome = {
    ...curveState.sharesByOutcome,
    [outcome]: Number((curveState.sharesByOutcome[outcome] + sharesPurchased).toFixed(8))
  };
  const nextProbabilities = computeCurveProbabilities(
    market.outcomes,
    nextSharesByOutcome,
    curveState.liquidityParameterHbar
  );

  return {
    liquidityParameterHbar: curveState.liquidityParameterHbar,
    sharesPurchased,
    preTradeOdds: Number(((preTradeProbabilities[outcome] ?? 0) * 100).toFixed(2)),
    nextSharesByOutcome,
    nextOddsByOutcome: toOddsPercentages(nextProbabilities, market.outcomes)
  };
}

function asMarketError(message: string, error: unknown): MarketError {
  if (error instanceof MarketError) {
    return error;
  }

  return new MarketError(message, error);
}

export async function placeBet(
  input: PlaceBetInput,
  options: PlaceBetOptions = {}
): Promise<MarketBet> {
  validateNonEmptyString(input.marketId, "marketId");
  validateNonEmptyString(input.bettorAccountId, "bettorAccountId");
  validateNonEmptyString(input.outcome, "outcome");
  validatePositiveNumber(input.amountHbar, "amountHbar");

  const store = getMarketStore(options.store);
  const market = store.markets.get(input.marketId);

  if (!market) {
    throw new MarketError(`Market ${input.marketId} was not found.`);
  }

  const deps: PlaceBetDependencies = {
    transferHbar,
    submitMessage,
    now: () => new Date(),
    ...options.deps
  };

  const now = deps.now();

  if (now.getTime() > Date.parse(market.closeTime)) {
    market.status = "CLOSED";
    persistMarketStore(store);
  }

  if (market.status !== "OPEN") {
    throw new MarketError(`Market ${input.marketId} is not open for betting.`);
  }

  const normalizedOutcome = input.outcome.trim().toUpperCase();

  if (!market.outcomes.includes(normalizedOutcome)) {
    throw new MarketError(
      `Invalid outcome "${input.outcome}". Supported outcomes: ${market.outcomes.join(", ")}.`
    );
  }

  try {
    const escrowTransfer = await deps.transferHbar(
      input.bettorAccountId,
      market.escrowAccountId,
      input.amountHbar,
      {
        client: options.client
      }
    );
    const curveTrade =
      market.liquidityModel === "WEIGHTED_CURVE"
        ? quoteCurveTrade(market, normalizedOutcome, input.amountHbar)
        : undefined;

    const audit = await deps.submitMessage(
      market.topicId,
      {
        type: "BET_PLACED",
        marketId: market.id,
        bettorAccountId: input.bettorAccountId,
        outcome: normalizedOutcome,
        amountHbar: input.amountHbar,
        curveSharesPurchased: curveTrade?.sharesPurchased,
        effectiveOdds: curveTrade?.preTradeOdds,
        nextOddsByOutcome: curveTrade?.nextOddsByOutcome,
        placedAt: now.toISOString()
      },
      { client: options.client }
    );

    const bet: MarketBet = {
      id: randomUUID(),
      marketId: market.id,
      bettorAccountId: input.bettorAccountId,
      outcome: normalizedOutcome,
      amountHbar: input.amountHbar,
      curveSharesPurchased: curveTrade?.sharesPurchased,
      effectiveOdds: curveTrade?.preTradeOdds,
      placedAt: now.toISOString(),
      escrowTransactionId: escrowTransfer.transactionId,
      escrowTransactionUrl: escrowTransfer.transactionUrl,
      topicTransactionId: audit.transactionId,
      topicSequenceNumber: audit.sequenceNumber
    };

    if (curveTrade) {
      market.curveState = {
        liquidityParameterHbar: curveTrade.liquidityParameterHbar,
        sharesByOutcome: curveTrade.nextSharesByOutcome
      };
      market.currentOddsByOutcome = curveTrade.nextOddsByOutcome;
    }

    const bets = store.bets.get(market.id) ?? [];
    bets.push(bet);
    store.bets.set(market.id, bets);
    persistMarketStore(store);

    return bet;
  } catch (error) {
    throw asMarketError(`Failed to place bet for market ${input.marketId}.`, error);
  }
}
