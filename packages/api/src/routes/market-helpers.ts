import { submitAttestation, type ReputationAttestation } from "@simulacrum/reputation";

export const CORRECT_VOTE_SCORE_DELTA = 5;
export const INCORRECT_VOTE_SCORE_DELTA = -5;
export const INCORRECT_SELF_ATTESTATION_SCORE_DELTA = -8;
const DEFAULT_ORACLE_MIN_VOTES = 2;
const DEFAULT_ORACLE_QUORUM_PERCENT = 0.6;

export interface OracleVoteLog {
  id: string;
  marketId: string;
  voterAccountId: string;
  outcome: string;
  confidence: number;
}

export interface OracleParticipantEstimateInput {
  creatorAccountId?: string;
  selfAttestation?: { attestedByAccountId?: string };
  challenges?: Array<{ challengerAccountId?: string }>;
  oracleVotes?: Array<{ voterAccountId?: string }>;
}

export interface OracleQuorumPolicy {
  oracleMinVotes: number;
  oracleEligibleVoterCount: number;
  oracleQuorumPercent: number;
}

export interface SelfAttestationLog {
  proposedOutcome: string;
  attestedByAccountId: string;
}

export function challengeFlowEnabled(): boolean {
  return (process.env.MARKET_CHALLENGE_FLOW_ENABLED ?? "true").toLowerCase() !== "false";
}

export async function applyOracleVoteReputation(
  marketId: string,
  resolvedOutcome: string,
  attesterAccountId: string,
  votes: OracleVoteLog[]
): Promise<ReputationAttestation[]> {
  const attestations: ReputationAttestation[] = [];

  for (const vote of votes) {
    const isCorrect = vote.outcome === resolvedOutcome;
    const scoreDelta = isCorrect ? CORRECT_VOTE_SCORE_DELTA : INCORRECT_VOTE_SCORE_DELTA;
    const attestation = await submitAttestation({
      subjectAccountId: vote.voterAccountId,
      attesterAccountId,
      scoreDelta,
      confidence: vote.confidence,
      reason: isCorrect
        ? `Oracle vote matched final outcome (${resolvedOutcome}) for market ${marketId}`
        : `Oracle vote diverged from final outcome (${resolvedOutcome}) for market ${marketId}`,
      tags: ["oracle-vote", isCorrect ? "vote-correct" : "vote-incorrect", `market:${marketId}`]
    });
    attestations.push(attestation);
  }

  return attestations;
}

export async function applySelfAttestationReputation(
  marketId: string,
  resolvedOutcome: string,
  attesterAccountId: string,
  selfAttestation: SelfAttestationLog | undefined
): Promise<ReputationAttestation | null> {
  if (!selfAttestation) {
    return null;
  }

  if (selfAttestation.proposedOutcome === resolvedOutcome) {
    return null;
  }

  return submitAttestation({
    subjectAccountId: selfAttestation.attestedByAccountId,
    attesterAccountId,
    scoreDelta: INCORRECT_SELF_ATTESTATION_SCORE_DELTA,
    confidence: 1,
    reason: `Self-attested outcome (${selfAttestation.proposedOutcome}) was overturned by final resolution (${resolvedOutcome}) for market ${marketId}`,
    tags: ["market-self-attestation", "attestation-incorrect", `market:${marketId}`]
  });
}

export function deduplicateVotes(votes: OracleVoteLog[]): OracleVoteLog[] {
  return Array.from(
    votes.reduce((map, vote) => {
      map.set(vote.voterAccountId.trim(), vote);
      return map;
    }, new Map<string, OracleVoteLog>()).values()
  );
}

export function estimateOracleParticipantCount(
  market: OracleParticipantEstimateInput | undefined,
  bettorAccountIds: readonly string[] = []
): number {
  const participants = new Set<string>();

  if (market?.creatorAccountId?.trim()) {
    participants.add(market.creatorAccountId.trim());
  }
  if (market?.selfAttestation?.attestedByAccountId?.trim()) {
    participants.add(market.selfAttestation.attestedByAccountId.trim());
  }
  for (const challenge of market?.challenges ?? []) {
    if (challenge.challengerAccountId?.trim()) {
      participants.add(challenge.challengerAccountId.trim());
    }
  }
  for (const vote of market?.oracleVotes ?? []) {
    if (vote.voterAccountId?.trim()) {
      participants.add(vote.voterAccountId.trim());
    }
  }
  for (const accountId of bettorAccountIds) {
    if (accountId?.trim()) {
      participants.add(accountId.trim());
    }
  }

  return Math.max(1, participants.size);
}

export function resolveOracleQuorumPolicy(activeAgentCount: number): OracleQuorumPolicy {
  const envMinVotes = Number(process.env.MARKET_ORACLE_MIN_VOTES);
  const envQuorumPercent = Number(process.env.MARKET_ORACLE_QUORUM_PERCENT);
  const envActiveAgentCount = Number(process.env.MARKET_ORACLE_ACTIVE_AGENTS);
  const oracleMinVotes =
    Number.isFinite(envMinVotes) && envMinVotes > 0
      ? Math.max(1, Math.round(envMinVotes))
      : DEFAULT_ORACLE_MIN_VOTES;
  const oracleQuorumPercent =
    Number.isFinite(envQuorumPercent) && envQuorumPercent >= 0
      ? Math.min(1, Math.max(0, envQuorumPercent))
      : DEFAULT_ORACLE_QUORUM_PERCENT;
  const oracleEligibleVoterCount =
    Number.isFinite(envActiveAgentCount) && envActiveAgentCount > 0
      ? Math.max(1, Math.round(envActiveAgentCount))
      : Math.max(1, Math.round(activeAgentCount));

  return {
    oracleMinVotes,
    oracleEligibleVoterCount,
    oracleQuorumPercent
  };
}
