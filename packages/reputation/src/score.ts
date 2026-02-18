import { clamp } from "@simulacrum/core";

import type { ReputationAttestation, ReputationScore } from "./types.js";

export interface ReputationScoreOptions {
  baseline?: number;
  minScore?: number;
  maxScore?: number;
  decayHalfLifeDays?: number;
  now?: Date;
}

function decayWeight(attestationDate: Date, now: Date, halfLifeDays: number): number {
  const ageMs = Math.max(0, now.getTime() - attestationDate.getTime());
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (!Number.isFinite(ageDays)) {
    return 1;
  }

  return Math.pow(0.5, ageDays / halfLifeDays);
}

export function calculateReputationScore(
  accountId: string,
  attestations: readonly ReputationAttestation[],
  options: ReputationScoreOptions = {}
): ReputationScore {
  const baseline = options.baseline ?? 50;
  const minScore = options.minScore ?? 0;
  const maxScore = options.maxScore ?? 100;
  const halfLifeDays = options.decayHalfLifeDays ?? 90;
  const now = options.now ?? new Date();

  const relevant = attestations.filter((attestation) => attestation.subjectAccountId === accountId);

  let weightedRawDelta = 0;
  let totalWeight = 0;

  for (const attestation of relevant) {
    const weight = decayWeight(new Date(attestation.createdAt), now, halfLifeDays) * attestation.confidence;
    totalWeight += weight;
    weightedRawDelta += attestation.scoreDelta * weight;
  }

  const normalizedDelta = totalWeight > 0 ? weightedRawDelta / totalWeight : 0;
  const score = clamp(baseline + normalizedDelta, minScore, maxScore);

  return {
    accountId,
    score,
    rawScore: baseline + normalizedDelta,
    attestationCount: relevant.length,
    confidence: clamp(totalWeight / Math.max(1, relevant.length), 0, 1)
  };
}

export function buildReputationLeaderboard(
  attestations: readonly ReputationAttestation[],
  options: ReputationScoreOptions = {}
): ReputationScore[] {
  const accounts = new Set<string>();

  for (const attestation of attestations) {
    accounts.add(attestation.subjectAccountId);
  }

  return Array.from(accounts)
    .map((accountId) => calculateReputationScore(accountId, attestations, options))
    .sort((a, b) => b.score - a.score);
}
