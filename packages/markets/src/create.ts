import { createFungibleToken, createTopic, submitMessage } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";

import { getMarketStore, persistMarketStore, type MarketStore } from "./store.js";
import { type CreateMarketInput, type Market, MarketError } from "./types.js";

interface CreateMarketDependencies {
  createTopic: typeof createTopic;
  createFungibleToken: typeof createFungibleToken;
  submitMessage: typeof submitMessage;
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

function validateNonEmptyString(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new MarketError(`${field} must be a non-empty string.`);
  }
}

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

function assertCloseTime(closeTime: string): void {
  const timestamp = Date.parse(closeTime);

  if (!Number.isFinite(timestamp)) {
    throw new MarketError("closeTime must be a valid ISO timestamp.");
  }
}

function shortSymbol(question: string, outcome: string): string {
  const prefix = question.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 5);
  return `${outcome.slice(0, 3)}${prefix}`.slice(0, 10);
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
  assertCloseTime(input.closeTime);

  const outcomes = normalizeOutcomes(input.outcomes);
  const initialOddsByOutcome = normalizeInitialOddsByOutcome(input.initialOddsByOutcome, outcomes);
  const store = getMarketStore(options.store);
  const deps: CreateMarketDependencies = {
    createTopic,
    createFungibleToken,
    submitMessage,
    now: () => new Date(),
    ...options.deps
  };

  try {
    const topic = await deps.createTopic(`MARKET:${input.question}`, undefined, {
      client: options.client
    });

    const outcomeTokenIds: Record<string, string> = {};
    const outcomeTokenUrls: Record<string, string> = {};

    for (const outcome of outcomes) {
      const token = await deps.createFungibleToken(
        `${input.question} - ${outcome}`,
        shortSymbol(input.question, outcome),
        0,
        2,
        {
          client: options.client,
          treasuryAccountId: input.creatorAccountId,
          memo: `Market ${topic.topicId} ${outcome}`
        }
      );

      outcomeTokenIds[outcome] = token.tokenId;
      outcomeTokenUrls[outcome] = token.tokenUrl;
    }

    const nowIso = deps.now().toISOString();
    const market: Market = {
      id: topic.topicId,
      question: input.question,
      description: input.description,
      creatorAccountId: input.creatorAccountId,
      escrowAccountId: input.escrowAccountId ?? input.creatorAccountId,
      topicId: topic.topicId,
      topicUrl: topic.topicUrl,
      closeTime: input.closeTime,
      createdAt: nowIso,
      status: "OPEN",
      outcomes,
      initialOddsByOutcome,
      outcomeTokenIds,
      outcomeTokenUrls,
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
        initialOddsByOutcome,
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
