import { Router } from "express";
import { z } from "zod";
import {
  BaseAgent,
  createContrarianStrategy,
  createRandomStrategy,
  createReputationBasedStrategy,
  runMultiAgentSimulation,
  type MarketSnapshot
} from "@simulacrum/agents";
import { calculateReputationScore, getReputationStore } from "@simulacrum/reputation";

import type { ApiEventBus } from "../events.js";
import { validateBody } from "../middleware/validation.js";

const createAgentSchema = z.object({
  name: z.string().min(1),
  accountId: z.string().min(1),
  bankrollHbar: z.number().nonnegative(),
  reputationScore: z.number().min(0).max(100).optional(),
  mode: z.enum(["AGGRESSIVE", "BALANCED", "CONSERVATIVE"]).optional(),
  strategy: z.enum(["random", "reputation", "contrarian"]).optional()
});

const decideSchema = z.object({
  market: z.object({
    id: z.string().min(1),
    question: z.string().min(1),
    creatorAccountId: z.string().min(1),
    outcomes: z.array(z.string().min(1)).min(2),
    status: z.enum(["OPEN", "CLOSED", "RESOLVED", "DISPUTED"]),
    closeTime: z.string().min(1)
  }),
  context: z.object({
    now: z.string().datetime(),
    reputationByAccount: z.record(z.number()),
    marketSentiment: z.record(z.record(z.number()))
  })
});

const simulationSchema = z.object({
  rounds: z.number().int().positive(),
  markets: z
    .array(
      z.object({
        id: z.string().min(1),
        question: z.string().min(1),
        creatorAccountId: z.string().min(1),
        outcomes: z.array(z.string().min(1)).min(2),
        status: z.enum(["OPEN", "CLOSED", "RESOLVED", "DISPUTED"]),
        closeTime: z.string().min(1)
      })
    )
    .min(1),
  agentIds: z.array(z.string().min(1)).optional()
});

export interface AgentRegistry {
  all(): BaseAgent[];
  get(id: string): BaseAgent | undefined;
  add(agent: BaseAgent): void;
}

function strategyFor(name: string | undefined) {
  switch (name) {
    case "reputation":
      return createReputationBasedStrategy();
    case "contrarian":
      return createContrarianStrategy();
    case "random":
    default:
      return createRandomStrategy();
  }
}

export function createAgentsRouter(registry: AgentRegistry, eventBus: ApiEventBus): Router {
  const router = Router();

  router.get("/", (_request, response) => {
    const reputationStore = getReputationStore();
    response.json({
      agents: registry.all().map((agent) => ({
        id: agent.id,
        name: agent.name,
        accountId: agent.accountId,
        bankrollHbar: agent.bankrollHbar,
        reputationScore: Number(
          calculateReputationScore(agent.accountId, reputationStore.attestations, {
            baseline: agent.reputationScore
          }).score.toFixed(2)
        ),
        strategy: agent.strategy.name
      }))
    });
  });

  router.post("/", validateBody(createAgentSchema), (request, response) => {
    try {
      const strategy = strategyFor(request.body.strategy);
      const agent = new BaseAgent(request.body, strategy);
      registry.add(agent);
      eventBus.publish("agent.created", { id: agent.id, name: agent.name });

      response.status(201).json({
        agent: {
          id: agent.id,
          name: agent.name,
          accountId: agent.accountId,
          bankrollHbar: agent.bankrollHbar,
          reputationScore: agent.reputationScore,
          strategy: strategy.name
        }
      });
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/:agentId/decide", validateBody(decideSchema), async (request, response) => {
    const agent = registry.get(request.params.agentId);

    if (!agent) {
      response.status(404).json({ error: `Agent ${request.params.agentId} not found` });
      return;
    }

    try {
      const decision = await agent.decideBet(request.body.market, {
        ...request.body.context,
        now: new Date(request.body.context.now)
      });
      response.status(200).json({ decision });
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/simulate", validateBody(simulationSchema), async (request, response) => {
    const selected = request.body.agentIds
      ? request.body.agentIds
          .map((id: string) => registry.get(id))
          .filter((agent: BaseAgent | undefined): agent is BaseAgent => Boolean(agent))
      : registry.all();

    if (selected.length === 0) {
      response.status(400).json({ error: "No agents available for simulation" });
      return;
    }

    try {
      const result = await runMultiAgentSimulation(selected, request.body.markets as MarketSnapshot[], {
        rounds: request.body.rounds,
        onBet: async ({ round, agent, market, decision }) => {
          eventBus.publish("agent.simulation.bet", {
            round,
            agentId: agent.id,
            marketId: market.id,
            decision
          });
        }
      });

      response.status(200).json({ result });
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
}
