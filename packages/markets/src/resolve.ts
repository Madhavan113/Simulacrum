import { randomUUID } from "node:crypto";

import { submitMessage, validateNonEmptyString } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";

import { getMarketStore, persistMarketStore, type MarketStore } from "./store.js";
import {
  MarketError,
  type ChallengeMarketInput,
  type MarketChallenge,
  type MarketOracleVote,
  type MarketResolution,
  type OracleVoteInput,
  type ResolveMarketInput,
  type SelfAttestMarketInput
} from "./types.js";

interface ResolveMarketDependencies {
  submitMessage: typeof submitMessage;
  now: () => Date;
}

export type ReputationLookup = (accountId: string) => number;

export interface ResolveMarketOptions {
  client?: Client;
  store?: MarketStore;
  deps?: Partial<ResolveMarketDependencies>;
  oracleMinVotes?: number;
  /**
   * Server-side reputation lookup. When provided, the caller-supplied
   * `reputationScore` on oracle votes is ignored and replaced with the
   * value returned by this function.
   */
  reputationLookup?: ReputationLookup;
}

function toMarketError(message: string, error: unknown): MarketError {
  if (error instanceof MarketError) {
    return error;
  }

  return new MarketError(message, error);
}

function challengeWindowMs(minutes: number | undefined): number {
  const parsed = typeof minutes === "number" && Number.isFinite(minutes) ? minutes : 15;
  return Math.max(1, Math.round(parsed)) * 60 * 1000;
}

function normalizeConfidence(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0.5;
  }

  return Math.min(1, Math.max(0, value));
}

export async function resolveMarket(
  input: ResolveMarketInput,
  options: ResolveMarketOptions = {}
): Promise<MarketResolution> {
  validateNonEmptyString(input.marketId, "marketId");
  validateNonEmptyString(input.resolvedByAccountId, "resolvedByAccountId");
  validateNonEmptyString(input.resolvedOutcome, "resolvedOutcome");

  const store = getMarketStore(options.store);
  const market = store.markets.get(input.marketId);

  if (!market) {
    throw new MarketError(`Market ${input.marketId} was not found.`);
  }

  const outcome = input.resolvedOutcome.trim().toUpperCase();

  if (!market.outcomes.includes(outcome)) {
    throw new MarketError(
      `Invalid resolved outcome "${input.resolvedOutcome}". Supported outcomes: ${market.outcomes.join(
        ", "
      )}.`
    );
  }

  if (market.status === "RESOLVED") {
    throw new MarketError(`Market ${input.marketId} is already resolved.`);
  }

  const deps: ResolveMarketDependencies = {
    submitMessage,
    now: () => new Date(),
    ...options.deps
  };

  try {
    const nowIso = deps.now().toISOString();

    market.status = "RESOLVED";
    market.resolvedOutcome = outcome;
    market.resolvedAt = nowIso;
    market.resolvedByAccountId = input.resolvedByAccountId;
    persistMarketStore(store);

    const audit = await deps.submitMessage(
      market.topicId,
      {
        type: "MARKET_RESOLVED",
        marketId: market.id,
        resolvedOutcome: outcome,
        resolvedByAccountId: input.resolvedByAccountId,
        reason: input.reason,
        resolvedAt: nowIso
      },
      { client: options.client }
    );

    return {
      marketId: market.id,
      resolvedOutcome: outcome,
      resolvedByAccountId: input.resolvedByAccountId,
      resolvedAt: nowIso,
      topicTransactionId: audit.transactionId,
      topicTransactionUrl: audit.transactionUrl,
      topicSequenceNumber: audit.sequenceNumber
    };
  } catch (error) {
    throw toMarketError(`Failed to resolve market ${input.marketId}.`, error);
  }
}

export async function selfAttestMarket(
  input: SelfAttestMarketInput,
  options: ResolveMarketOptions = {}
): Promise<{
  marketId: string;
  challengeWindowEndsAt: string;
  selfAttestation: {
    proposedOutcome: string;
    attestedByAccountId: string;
    reason?: string;
    evidence?: string;
    attestedAt: string;
  };
}> {
  validateNonEmptyString(input.marketId, "marketId");
  validateNonEmptyString(input.attestedByAccountId, "attestedByAccountId");
  validateNonEmptyString(input.proposedOutcome, "proposedOutcome");

  const store = getMarketStore(options.store);
  const market = store.markets.get(input.marketId);

  if (!market) {
    throw new MarketError(`Market ${input.marketId} was not found.`);
  }

  const proposedOutcome = input.proposedOutcome.trim().toUpperCase();

  if (!market.outcomes.includes(proposedOutcome)) {
    throw new MarketError(
      `Invalid proposed outcome "${input.proposedOutcome}". Supported outcomes: ${market.outcomes.join(", ")}.`
    );
  }

  if (market.status === "RESOLVED") {
    throw new MarketError(`Market ${input.marketId} is already resolved.`);
  }

  const deps: ResolveMarketDependencies = {
    submitMessage,
    now: () => new Date(),
    ...options.deps
  };
  const now = deps.now();
  const nowIso = now.toISOString();
  const windowEnds = new Date(now.getTime() + challengeWindowMs(input.challengeWindowMinutes)).toISOString();
  const attestation = {
    proposedOutcome,
    attestedByAccountId: input.attestedByAccountId,
    reason: input.reason,
    evidence: input.evidence,
    attestedAt: nowIso
  };

  market.status = "DISPUTED";
  market.selfAttestation = attestation;
  market.challengeWindowEndsAt = windowEnds;
  market.challenges = [];
  market.oracleVotes = [];
  persistMarketStore(store);

  await deps.submitMessage(
    market.topicId,
    {
      type: "MARKET_SELF_ATTESTED",
      marketId: market.id,
      ...attestation,
      challengeWindowEndsAt: windowEnds
    },
    { client: options.client }
  );

  return {
    marketId: market.id,
    challengeWindowEndsAt: windowEnds,
    selfAttestation: attestation
  };
}

export async function challengeMarketResolution(
  input: ChallengeMarketInput,
  options: ResolveMarketOptions = {}
): Promise<{ challenge: MarketChallenge }> {
  validateNonEmptyString(input.marketId, "marketId");
  validateNonEmptyString(input.challengerAccountId, "challengerAccountId");
  validateNonEmptyString(input.proposedOutcome, "proposedOutcome");
  validateNonEmptyString(input.reason, "reason");

  const store = getMarketStore(options.store);
  const market = store.markets.get(input.marketId);

  if (!market) {
    throw new MarketError(`Market ${input.marketId} was not found.`);
  }

  if (!market.challengeWindowEndsAt || !market.selfAttestation) {
    throw new MarketError(`Market ${input.marketId} has no active self-attestation challenge window.`);
  }

  if (Date.now() > Date.parse(market.challengeWindowEndsAt)) {
    throw new MarketError(`Challenge window for market ${input.marketId} has ended.`);
  }

  const proposedOutcome = input.proposedOutcome.trim().toUpperCase();

  if (!market.outcomes.includes(proposedOutcome)) {
    throw new MarketError(
      `Invalid proposed outcome "${input.proposedOutcome}". Supported outcomes: ${market.outcomes.join(", ")}.`
    );
  }

  const deps: ResolveMarketDependencies = {
    submitMessage,
    now: () => new Date(),
    ...options.deps
  };
  const challenge: MarketChallenge = {
    id: randomUUID(),
    marketId: market.id,
    challengerAccountId: input.challengerAccountId,
    proposedOutcome,
    reason: input.reason,
    evidence: input.evidence,
    createdAt: deps.now().toISOString()
  };

  market.challenges = [...(market.challenges ?? []), challenge];
  persistMarketStore(store);

  await deps.submitMessage(
    market.topicId,
    {
      type: "MARKET_CHALLENGED",
      ...challenge
    },
    { client: options.client }
  );

  return { challenge };
}

export async function submitOracleVote(
  input: OracleVoteInput,
  options: ResolveMarketOptions = {}
): Promise<{
  vote: MarketOracleVote;
  finalized?: MarketResolution;
}> {
  validateNonEmptyString(input.marketId, "marketId");
  validateNonEmptyString(input.voterAccountId, "voterAccountId");
  validateNonEmptyString(input.outcome, "outcome");

  const store = getMarketStore(options.store);
  const market = store.markets.get(input.marketId);

  if (!market) {
    throw new MarketError(`Market ${input.marketId} was not found.`);
  }

  if (!market.selfAttestation || !market.challengeWindowEndsAt) {
    throw new MarketError(`Market ${input.marketId} is not in challenge/oracle resolution flow.`);
  }

  if (market.status === "RESOLVED") {
    throw new MarketError(`Market ${input.marketId} is already resolved.`);
  }

  const voterAccountId = input.voterAccountId.trim();
  const existingVote = (market.oracleVotes ?? []).find((entry) => entry.voterAccountId === voterAccountId);

  if (existingVote) {
    throw new MarketError(
      `Account ${voterAccountId} has already submitted an oracle vote for market ${input.marketId}.`
    );
  }

  const normalizedOutcome = input.outcome.trim().toUpperCase();

  if (!market.outcomes.includes(normalizedOutcome)) {
    throw new MarketError(
      `Invalid vote outcome "${input.outcome}". Supported outcomes: ${market.outcomes.join(", ")}.`
    );
  }

  const deps: ResolveMarketDependencies = {
    submitMessage,
    now: () => new Date(),
    ...options.deps
  };
  const verifiedReputation = options.reputationLookup
    ? options.reputationLookup(voterAccountId)
    : input.reputationScore;

  const vote: MarketOracleVote = {
    id: randomUUID(),
    marketId: market.id,
    voterAccountId,
    outcome: normalizedOutcome,
    confidence: normalizeConfidence(input.confidence),
    reason: input.reason,
    reputationScore: verifiedReputation,
    createdAt: deps.now().toISOString()
  };

  market.oracleVotes = [...(market.oracleVotes ?? []), vote];
  persistMarketStore(store);

  await deps.submitMessage(
    market.topicId,
    {
      type: "MARKET_ORACLE_VOTE",
      ...vote
    },
    { client: options.client }
  );

  const windowEnded = Date.now() >= Date.parse(market.challengeWindowEndsAt);
  const votes = market.oracleVotes ?? [];
  const minVotes = options.oracleMinVotes ?? 2;
  const shouldFinalize = windowEnded || votes.length >= minVotes;

  if (!shouldFinalize) {
    return { vote };
  }

  const weighted = new Map<string, number>();

  for (const entry of votes) {
    const weight = Math.max(1, entry.reputationScore ?? 1) * Math.max(0.1, entry.confidence);
    weighted.set(entry.outcome, (weighted.get(entry.outcome) ?? 0) + weight);
  }

  if (weighted.size === 0) {
    return { vote };
  }

  const winner = Array.from(weighted.entries()).sort((left, right) => right[1] - left[1])[0]?.[0];
  const resolvedOutcome = winner ?? market.selfAttestation.proposedOutcome;
  const resolution = await resolveMarket(
    {
      marketId: market.id,
      resolvedOutcome,
      resolvedByAccountId: input.voterAccountId,
      reason: "Peer oracle weighted vote finalization"
    },
    options
  );

  return {
    vote,
    finalized: resolution
  };
}
