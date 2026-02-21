import { randomUUID } from "node:crypto";

import { createTopic, submitMessage, transferHbar, validateNonEmptyString } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";

import { getMarketStore, persistMarketStore, type MarketStore } from "./store.js";
import {
  type CreateMarketInput,
  type Market,
  type MarketCurveState,
  type MarketLiquidityModel,
  type MarketOrder,
  type SeedOrder,
  MarketError
} from "./types.js";

interface CreateMarketDependencies {
  createTopic: typeof createTopic;
  submitMessage: typeof submitMessage;
  transferHbar: typeof transferHbar;
  now: () => Date;
}

export interface CreateMarketOptions {
  client?: Client;
  store?: MarketStore;
  deps?: Partial<CreateMarketDependencies>;
}

export interface CreateMarketResult {
  market: Market;
  topicTransactionId: string;
  topicTransactionUrl: string;
}

const DEFAULT_OUTCOMES = ["YES", "NO"];
const DEFAULT_CURVE_LIQUIDITY_HBAR = 25;

function normalizeOutcomes(outcomes?: readonly string[]): string[] {
  const resolved = outcomes && outcomes.length > 0 ? outcomes : DEFAULT_OUTCOMES;
  const unique = new Set<string>();

  for (const outcome of resolved) {
    const normalized = outcome.trim().toUpperCase();

    if (normalized.length === 0) {
      throw new MarketError("outcomes must not include empty values.");
    }

    unique.add(normalized);
  }

  if (unique.size < 2) {
    throw new MarketError("A market requires at least two unique outcomes.");
  }

  return Array.from(unique);
}

function normalizeInitialOddsByOutcome(
  initialOddsByOutcome: Record<string, number> | undefined,
  outcomes: readonly string[]
): Record<string, number> | undefined {
  if (!initialOddsByOutcome) {
    return undefined;
  }

  const normalizedInput = Object.fromEntries(
    Object.entries(initialOddsByOutcome).map(([key, value]) => [key.trim().toUpperCase(), value])
  );
  const weights: Record<string, number> = {};
  let totalWeight = 0;

  for (const outcome of outcomes) {
    const raw = normalizedInput[outcome];
    const weight = Number.isFinite(raw) && raw > 0 ? raw : 1;
    weights[outcome] = weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) {
    throw new MarketError("initialOddsByOutcome must contain at least one positive value.");
  }

  const percentages: Record<string, number> = {};
  let runningTotal = 0;

  for (let index = 0; index < outcomes.length; index += 1) {
    const outcome = outcomes[index];

    if (!outcome) {
      continue;
    }

    if (index === outcomes.length - 1) {
      percentages[outcome] = Number((100 - runningTotal).toFixed(2));
    } else {
      const value = Number(((weights[outcome] / totalWeight) * 100).toFixed(2));
      percentages[outcome] = value;
      runningTotal += value;
    }
  }

  return percentages;
}

function resolveLiquidityModel(input: CreateMarketInput): MarketLiquidityModel {
  if (
    input.liquidityModel === "WEIGHTED_CURVE" ||
    input.liquidityModel === "LOW_LIQUIDITY"
  ) {
    return "LOW_LIQUIDITY";
  }

  if (input.lowLiquidity) {
    return "LOW_LIQUIDITY";
  }

  if (
    input.liquidityModel === "CLOB" ||
    input.liquidityModel === "HIGH_LIQUIDITY"
  ) {
    return "HIGH_LIQUIDITY";
  }

  return "HIGH_LIQUIDITY";
}

function isLowLiquidityModel(model: MarketLiquidityModel): boolean {
  return model === "WEIGHTED_CURVE" || model === "LOW_LIQUIDITY";
}

function normalizeCurveLiquidityHbar(
  value: number | undefined,
  liquidityModel: MarketLiquidityModel
): number | undefined {
  if (!isLowLiquidityModel(liquidityModel)) {
    return undefined;
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Number(value.toFixed(6));
  }

  return DEFAULT_CURVE_LIQUIDITY_HBAR;
}

function fallbackOdds(outcomes: readonly string[]): Record<string, number> {
  const share = Number((100 / outcomes.length).toFixed(2));
  const resolved: Record<string, number> = {};
  let running = 0;

  for (let index = 0; index < outcomes.length; index += 1) {
    const outcome = outcomes[index];

    if (!outcome) {
      continue;
    }

    if (index === outcomes.length - 1) {
      resolved[outcome] = Number((100 - running).toFixed(2));
      continue;
    }

    resolved[outcome] = share;
    running += share;
  }

  return resolved;
}

function normalizeProbabilities(
  oddsByOutcome: Record<string, number>,
  outcomes: readonly string[]
): Record<string, number> {
  const probabilities: Record<string, number> = {};
  let total = 0;

  for (const outcome of outcomes) {
    const raw = oddsByOutcome[outcome];
    const probability = Number.isFinite(raw) && raw > 0 ? raw / 100 : 0;
    probabilities[outcome] = probability;
    total += probability;
  }

  if (total <= 0) {
    const uniform = 1 / outcomes.length;
    for (const outcome of outcomes) {
      probabilities[outcome] = uniform;
    }
    return probabilities;
  }

  for (const outcome of outcomes) {
    probabilities[outcome] = probabilities[outcome] / total;
  }

  return probabilities;
}

function initializeCurveState(
  outcomes: readonly string[],
  oddsByOutcome: Record<string, number>,
  liquidityParameterHbar: number
): MarketCurveState {
  const probabilities = normalizeProbabilities(oddsByOutcome, outcomes);
  const sharesByOutcome: Record<string, number> = {};

  for (const outcome of outcomes) {
    const probability = Math.max(0.0001, probabilities[outcome] ?? 0.0001);
    sharesByOutcome[outcome] = Number((liquidityParameterHbar * Math.log(probability)).toFixed(8));
  }

  return {
    liquidityParameterHbar,
    sharesByOutcome
  };
}

function assertCloseTime(closeTime: string, now: Date): void {
  const timestamp = Date.parse(closeTime);

  if (!Number.isFinite(timestamp)) {
    throw new MarketError("closeTime must be a valid ISO timestamp.");
  }

  if (timestamp <= now.getTime()) {
    throw new MarketError("closeTime must be in the future.");
  }
}

function toMarketError(message: string, error: unknown): MarketError {
  if (error instanceof MarketError) {
    return error;
  }

  return new MarketError(message, error);
}

export async function createMarket(
  input: CreateMarketInput,
  options: CreateMarketOptions = {}
): Promise<CreateMarketResult> {
  validateNonEmptyString(input.question, "question");
  validateNonEmptyString(input.creatorAccountId, "creatorAccountId");

  const deps: CreateMarketDependencies = {
    createTopic,
    submitMessage,
    now: () => new Date(),
    ...options.deps
  };

  assertCloseTime(input.closeTime, deps.now());

  const outcomes = normalizeOutcomes(input.outcomes);
  const initialOddsByOutcome = normalizeInitialOddsByOutcome(input.initialOddsByOutcome, outcomes);
  const liquidityModel = resolveLiquidityModel(input);
  const curveLiquidityHbar = normalizeCurveLiquidityHbar(input.curveLiquidityHbar, liquidityModel);
  const currentOddsByOutcome = initialOddsByOutcome ?? fallbackOdds(outcomes);
  const curveState =
    isLowLiquidityModel(liquidityModel) && curveLiquidityHbar
      ? initializeCurveState(outcomes, currentOddsByOutcome, curveLiquidityHbar)
      : undefined;
  const store = getMarketStore(options.store);

  const resolvedEscrow = input.escrowAccountId ?? input.creatorAccountId;

  try {
    const topic = await deps.createTopic(`MARKET:${input.question}`, undefined, {
      client: options.client
    });

    const syntheticOutcomeIds: Record<string, string> = {};
    for (const outcome of outcomes) {
      syntheticOutcomeIds[outcome] = `${topic.topicId}:${outcome}`;
    }

    const nowIso = deps.now().toISOString();
    const market: Market = {
      id: topic.topicId,
      question: input.question,
      description: input.description,
      creatorAccountId: input.creatorAccountId,
      escrowAccountId: resolvedEscrow,
      topicId: topic.topicId,
      topicUrl: topic.topicUrl,
      closeTime: input.closeTime,
      createdAt: nowIso,
      status: "OPEN",
      outcomes,
      liquidityModel,
      initialOddsByOutcome,
      currentOddsByOutcome,
      curveState,
      syntheticOutcomeIds,
      challenges: [],
      oracleVotes: []
    };

    store.markets.set(market.id, market);
    persistMarketStore(store);

    await deps.submitMessage(
      topic.topicId,
      {
        type: "MARKET_CREATED",
        marketId: market.id,
        question: market.question,
        outcomes,
        liquidityModel,
        initialOddsByOutcome,
        currentOddsByOutcome: market.currentOddsByOutcome,
        closeTime: market.closeTime,
        creatorAccountId: market.creatorAccountId,
        createdAt: market.createdAt
      },
      { client: options.client }
    );

    return {
      market,
      topicTransactionId: topic.transactionId,
      topicTransactionUrl: topic.transactionUrl
    };
  } catch (error) {
    throw toMarketError("Failed to create market.", error);
  }
}
