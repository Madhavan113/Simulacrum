import { submitAttestation, type ReputationAttestation } from "@simulacrum/reputation";

export const CORRECT_VOTE_SCORE_DELTA = 6;
export const INCORRECT_VOTE_SCORE_DELTA = -4;

export interface OracleVoteLog {
  id: string;
  marketId: string;
  voterAccountId: string;
  outcome: string;
  confidence: number;
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

export function deduplicateVotes(votes: OracleVoteLog[]): OracleVoteLog[] {
  return Array.from(
    votes.reduce((map, vote) => {
      map.set(vote.voterAccountId.trim(), vote);
      return map;
    }, new Map<string, OracleVoteLog>()).values()
  );
}
