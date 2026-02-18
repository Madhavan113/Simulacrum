import type {
  AgentContext,
  AgentStrategy,
  BaseAgent,
  BetDecision,
  MarketSnapshot
} from "../agent.js";

export interface ReputationStrategyOptions {
  highReputationThreshold?: number;
  minStakeHbar?: number;
  maxStakePct?: number;
}

function pickBinaryOutcome(market: MarketSnapshot, optimistic: boolean): string {
  const normalized = market.outcomes.map((outcome) => outcome.toUpperCase());
  const yesIndex = normalized.indexOf("YES");
  const noIndex = normalized.indexOf("NO");

  if (yesIndex >= 0 && noIndex >= 0) {
    return optimistic ? market.outcomes[yesIndex] ?? market.outcomes[0] ?? "YES" : market.outcomes[noIndex] ?? market.outcomes[0] ?? "NO";
  }

  if (optimistic) {
    return market.outcomes[0] ?? "YES";
  }

  return market.outcomes[1] ?? market.outcomes[0] ?? "NO";
}

export function createReputationBasedStrategy(
  options: ReputationStrategyOptions = {}
): AgentStrategy {
  const threshold = options.highReputationThreshold ?? 65;
  const minStake = options.minStakeHbar ?? 1;
  const maxStakePct = options.maxStakePct ?? 0.3;

  return {
    name: "reputation-based",
    decide(agent: BaseAgent, market: MarketSnapshot, context: AgentContext): BetDecision {
      const creatorReputation = context.reputationByAccount[market.creatorAccountId] ?? 50;
      const optimistic = creatorReputation >= threshold;
      const outcome = pickBinaryOutcome(market, optimistic);
      const confidence = Math.min(0.95, Math.max(0.55, creatorReputation / 100));
      const bankrollFactor = Math.max(1, agent.bankrollHbar * maxStakePct);
      const amountHbar = Math.max(minStake, Number((confidence * bankrollFactor).toFixed(2)));

      return {
        outcome,
        amountHbar,
        confidence,
        rationale: `Creator reputation (${creatorReputation.toFixed(1)}) suggests ${outcome}`
      };
    }
  };
}
