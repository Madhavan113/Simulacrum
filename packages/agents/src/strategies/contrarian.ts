import type {
  AgentContext,
  AgentStrategy,
  BaseAgent,
  BetDecision,
  MarketSnapshot
} from "../agent.js";

export interface ContrarianStrategyOptions {
  minStakeHbar?: number;
  maxStakePct?: number;
}

function leastPopularOutcome(market: MarketSnapshot, sentiment: Record<string, number>): string {
  return [...market.outcomes]
    .sort((a, b) => (sentiment[a] ?? 0) - (sentiment[b] ?? 0))[0] ?? market.outcomes[0] ?? "YES";
}

export function createContrarianStrategy(options: ContrarianStrategyOptions = {}): AgentStrategy {
  const minStake = options.minStakeHbar ?? 1;
  const maxStakePct = options.maxStakePct ?? 0.2;

  return {
    name: "contrarian",
    decide(agent: BaseAgent, market: MarketSnapshot, context: AgentContext): BetDecision {
      const sentiment = context.marketSentiment[market.id] ?? {};
      const outcome = leastPopularOutcome(market, sentiment);
      const antiConsensus = 1 - Math.min(1, (sentiment[outcome] ?? 0.5));
      const confidence = Math.max(0.45, antiConsensus);
      const amountHbar = Math.max(
        minStake,
        Number((agent.bankrollHbar * maxStakePct * confidence).toFixed(2))
      );

      return {
        outcome,
        amountHbar,
        confidence,
        rationale: `Contrarian pick against consensus on ${outcome}`
      };
    }
  };
}
