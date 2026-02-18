import type {
  AgentContext,
  AgentStrategy,
  BaseAgent,
  BetDecision,
  MarketSnapshot
} from "../agent.js";

export interface RandomStrategyOptions {
  minStakeHbar?: number;
  maxStakePct?: number;
  random?: () => number;
}

export function createRandomStrategy(options: RandomStrategyOptions = {}): AgentStrategy {
  const minStake = options.minStakeHbar ?? 1;
  const maxStakePct = options.maxStakePct ?? 0.2;
  const random = options.random ?? Math.random;

  return {
    name: "random",
    decide(agent: BaseAgent, market: MarketSnapshot, _context: AgentContext): BetDecision | null {
      if (market.outcomes.length === 0) {
        return null;
      }

      const outcome = market.outcomes[Math.floor(random() * market.outcomes.length)] ?? market.outcomes[0];

      if (!outcome) {
        return null;
      }

      const maxStake = Math.max(minStake, agent.bankrollHbar * maxStakePct);
      const amountHbar = Math.max(minStake, Number((minStake + random() * maxStake).toFixed(2)));

      return {
        outcome,
        amountHbar,
        confidence: 0.5,
        rationale: "Randomized baseline exploration strategy"
      };
    }
  };
}
