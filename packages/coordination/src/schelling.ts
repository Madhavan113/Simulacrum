import type { SchellingVote } from "./types.js";

export interface SchellingResult {
  winningOption: string;
  winningWeight: number;
  totalWeight: number;
  confidence: number;
  breakdown: Record<string, number>;
}

function validateVotes(votes: readonly SchellingVote[]): void {
  if (votes.length === 0) {
    throw new Error("votes must include at least one vote.");
  }

  for (const vote of votes) {
    if (vote.option.trim().length === 0) {
      throw new Error("vote.option must be non-empty.");
    }

    if (!Number.isFinite(vote.weight) || vote.weight <= 0) {
      throw new Error("vote.weight must be a positive number.");
    }
  }
}

export function findSchellingPoint(votes: readonly SchellingVote[]): SchellingResult {
  validateVotes(votes);

  const totals = new Map<string, number>();

  for (const vote of votes) {
    const option = vote.option.trim().toUpperCase();
    totals.set(option, (totals.get(option) ?? 0) + vote.weight);
  }

  const sorted = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  const [winningOption, winningWeight] = sorted[0] ?? ["", 0];
  const totalWeight = sorted.reduce((sum, [, weight]) => sum + weight, 0);

  return {
    winningOption,
    winningWeight,
    totalWeight,
    confidence: totalWeight > 0 ? winningWeight / totalWeight : 0,
    breakdown: Object.fromEntries(sorted)
  };
}
