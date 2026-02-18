import { BaseAgent, type AgentContext, type MarketSnapshot } from "./agent.js";

export interface SimulationOptions {
  rounds: number;
  now?: () => Date;
  onBet?: (event: {
    round: number;
    agent: BaseAgent;
    market: MarketSnapshot;
    decision: {
      outcome: string;
      amountHbar: number;
      confidence: number;
      rationale: string;
    };
  }) => Promise<void> | void;
}

export interface SimulationResult {
  rounds: number;
  betsPlaced: number;
  skippedDecisions: number;
  byAgent: Record<string, number>;
}

function defaultContext(now: Date): AgentContext {
  return {
    now,
    reputationByAccount: {},
    marketSentiment: {}
  };
}

export async function runMultiAgentSimulation(
  agents: readonly BaseAgent[],
  markets: readonly MarketSnapshot[],
  options: SimulationOptions
): Promise<SimulationResult> {
  if (!Number.isInteger(options.rounds) || options.rounds <= 0) {
    throw new Error("options.rounds must be a positive integer.");
  }

  const now = options.now ?? (() => new Date());
  let betsPlaced = 0;
  let skippedDecisions = 0;
  const byAgent: Record<string, number> = {};

  for (let round = 1; round <= options.rounds; round += 1) {
    const context = defaultContext(now());

    for (const market of markets) {
      for (const agent of agents) {
        const decision = await agent.decideBet(market, context);

        if (!decision) {
          skippedDecisions += 1;
          continue;
        }

        agent.adjustBankroll(-decision.amountHbar);
        byAgent[agent.id] = (byAgent[agent.id] ?? 0) + 1;
        betsPlaced += 1;

        await options.onBet?.({
          round,
          agent,
          market,
          decision
        });
      }
    }
  }

  return {
    rounds: options.rounds,
    betsPlaced,
    skippedDecisions,
    byAgent
  };
}
