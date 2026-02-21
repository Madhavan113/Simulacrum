import { Router } from "express";
import { z } from "zod";
import { createAccount, getBalance } from "@simulacrum/core";
import {
  challengeMarketResolution,
  claimWinnings,
  createMarket,
  getMarketStore,
  getOrderBook,
  placeBet,
  publishOrder,
  resolveMarket,
  selfAttestMarket,
  submitOracleVote
} from "@simulacrum/markets";
import {
  calculateReputationScore,
  getReputationStore
} from "@simulacrum/reputation";

import type { AgentAuthService } from "../agent-platform/auth.js";
import type { AgentFaucetService } from "../agent-platform/faucet.js";
import type { ApiEventBus } from "../events.js";
import { createAgentAuthMiddleware } from "../middleware/agent-auth.js";
import { validateBody } from "../middleware/validation.js";
import {
  applyOracleVoteReputation,
  applySelfAttestationReputation,
  challengeFlowEnabled,
  deduplicateVotes,
  estimateOracleParticipantCount,
  resolveOracleQuorumPolicy,
  type OracleVoteLog
} from "./market-helpers.js";

const registerSchema = z.object({
  name: z.string().min(1),
  authPublicKey: z.string().min(1),
  agentId: z.string().min(1).optional()
});

const challengeSchema = z.object({
  agentId: z.string().min(1)
});

const verifySchema = z.object({
  agentId: z.string().min(1),
  challengeId: z.string().min(1),
  signature: z.string().min(1)
});

const createMarketSchema = z.object({
  question: z.string().min(1),
  description: z.string().optional(),
  closeTime: z.string().min(1),
  outcomes: z.array(z.string().min(1)).optional(),
  initialOddsByOutcome: z.record(z.number().positive()).optional(),
  lowLiquidity: z.boolean().optional(),
  liquidityModel: z.enum(["CLOB", "WEIGHTED_CURVE", "HIGH_LIQUIDITY", "LOW_LIQUIDITY"]).optional(),
  curveLiquidityHbar: z.number().positive().optional()
});

const placeBetSchema = z.object({
  outcome: z.string().min(1),
  amountHbar: z.number().positive()
});

const orderSchema = z.object({
  outcome: z.string().min(1),
  side: z.enum(["BID", "ASK"]),
  quantity: z.number().positive(),
  price: z.number().positive()
});

const resolveSchema = z.object({
  resolvedOutcome: z.string().min(1),
  reason: z.string().optional()
});

const selfAttestSchema = z.object({
  proposedOutcome: z.string().min(1),
  reason: z.string().optional(),
  evidence: z.string().optional(),
  challengeWindowMinutes: z.number().int().positive().optional()
});

const challengeResolutionSchema = z.object({
  proposedOutcome: z.string().min(1),
  reason: z.string().min(1),
  evidence: z.string().optional()
});

const oracleVoteSchema = z.object({
  outcome: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
  reputationScore: z.number().min(0).max(100).optional()
});

const claimSchema = z.object({
  payoutAccountId: z.string().optional()
});

export interface CreateAgentV1RouterOptions {
  eventBus: ApiEventBus;
  authService: AgentAuthService;
  faucetService: AgentFaucetService;
  selfRegistrationEnabled?: boolean;
}

export function createAgentV1Router(options: CreateAgentV1RouterOptions): Router {
  const router = Router();
  const selfRegistrationEnabled = options.selfRegistrationEnabled ?? true;

  router.post("/auth/register", validateBody(registerSchema), async (request, response) => {
    if (!selfRegistrationEnabled) {
      response.status(403).json({ error: "Self-registration is disabled." });
      return;
    }

    try {
      const existingAgents = options.authService.listAgents();
      const proposedId = request.body.agentId?.trim();
      if (proposedId && existingAgents.some((a) => a.id === proposedId)) {
        response.status(400).json({ error: `Agent ${proposedId} is already registered.` });
        return;
      }
      if (existingAgents.some((a) => a.name.toLowerCase() === request.body.name.trim().toLowerCase())) {
        response.status(400).json({ error: `Agent name "${request.body.name}" is already taken.` });
        return;
      }

      const created = await createAccount(options.faucetService.initialFundingHbar);
      const agent = options.authService.registerAgent({
        id: request.body.agentId,
        name: request.body.name,
        authPublicKey: request.body.authPublicKey,
        wallet: {
          accountId: created.accountId,
          privateKey: created.privateKey,
          privateKeyType: "der"
        }
      });
      options.faucetService.recordRegistrationFunding(agent.id, options.faucetService.initialFundingHbar);

      console.log(`[agent-platform] Agent registered: "${agent.name}" (${agent.id}) wallet=${agent.walletAccountId}`);
      options.eventBus.publish("agent.v1.registered", {
        agentId: agent.id,
        name: agent.name,
        walletAccountId: agent.walletAccountId,
        source: "platform"
      });

      response.status(201).json({
        agent: {
          id: agent.id,
          name: agent.name,
          walletAccountId: agent.walletAccountId,
          status: agent.status,
          createdAt: agent.createdAt
        },
        wallet: {
          accountId: agent.walletAccountId,
          initialFundingHbar: options.faucetService.initialFundingHbar
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const cause = error instanceof Error && error.cause ? ` — ${(error.cause as Error).message ?? error.cause}` : "";
      console.error(`[agent-v1] Registration failed for "${request.body.name}": ${message}${cause}`);
      response.status(400).json({ error: message });
    }
  });

  router.post("/auth/challenge", validateBody(challengeSchema), (request, response) => {
    try {
      const challenge = options.authService.createChallenge(request.body.agentId);
      response.status(201).json(challenge);
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/auth/verify", validateBody(verifySchema), (request, response) => {
    try {
      const verified = options.authService.verifyChallenge(request.body);
      response.status(200).json({
        tokenType: "Bearer",
        ...verified
      });
    } catch (error) {
      response.status(401).json({ error: (error as Error).message });
    }
  });

  router.post("/auth/refresh", (request, response) => {
    try {
      const authHeader = request.headers.authorization;
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : authHeader ?? "";
      const result = options.authService.refreshToken(token);
      response.status(200).json({ tokenType: "Bearer", ...result });
    } catch (error) {
      response.status(401).json({ error: (error as Error).message });
    }
  });

  router.use(createAgentAuthMiddleware(options.authService));

  router.get("/me", async (request, response) => {
    const context = request.agentContext;

    if (!context) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    const agent = options.authService.getAgent(context.agentId);

    if (!agent) {
      response.status(404).json({ error: "Agent not found." });
      return;
    }

    try {
      const client = options.authService.getClientForAgent(context.agentId);
      const balance = await getBalance(context.walletAccountId, { client });
      response.status(200).json({
        agent: {
          id: agent.id,
          name: agent.name,
          walletAccountId: agent.walletAccountId,
          status: agent.status,
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt,
          lastLoginAt: agent.lastLoginAt
        },
        wallet: balance
      });
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/markets", (_request, response) => {
    const store = getMarketStore();
    response.status(200).json({
      markets: Array.from(store.markets.values())
    });
  });

  router.get("/markets/:marketId", (request, response) => {
    const store = getMarketStore();
    const market = store.markets.get(request.params.marketId);

    if (!market) {
      response.status(404).json({ error: `Market ${request.params.marketId} not found` });
      return;
    }

    response.status(200).json({ market });
  });

  router.get("/markets/:marketId/bets", (request, response) => {
    const store = getMarketStore();
    const market = store.markets.get(request.params.marketId);

    if (!market) {
      response.status(404).json({ error: `Market ${request.params.marketId} not found` });
      return;
    }

    const bets = store.bets.get(request.params.marketId) ?? [];
    const stakeByOutcome = Object.fromEntries(market.outcomes.map((outcome) => [outcome, 0]));
    let totalStakedHbar = 0;

    for (const bet of bets) {
      totalStakedHbar += bet.amountHbar;

      if (bet.outcome in stakeByOutcome) {
        stakeByOutcome[bet.outcome] = (stakeByOutcome[bet.outcome] ?? 0) + bet.amountHbar;
      }
    }

    response.status(200).json({
      marketId: request.params.marketId,
      betCount: bets.length,
      totalStakedHbar: Number(totalStakedHbar.toFixed(6)),
      stakeByOutcome,
      bets
    });
  });

  router.get("/markets/:marketId/orderbook", async (request, response) => {
    try {
      const orderBook = await getOrderBook(request.params.marketId, {
        includeMirrorNode: request.query.mirror === "true"
      });
      response.status(200).json(orderBook);
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/markets", validateBody(createMarketSchema), async (request, response) => {
    const context = request.agentContext;

    if (!context) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const created = await createMarket(
        {
          question: request.body.question,
          description: request.body.description,
          creatorAccountId: context.walletAccountId,
          escrowAccountId: context.walletAccountId,
          closeTime: request.body.closeTime,
          outcomes: request.body.outcomes,
          initialOddsByOutcome: request.body.initialOddsByOutcome,
          lowLiquidity: request.body.lowLiquidity,
          liquidityModel: request.body.liquidityModel,
          curveLiquidityHbar: request.body.curveLiquidityHbar
        },
        { client: options.authService.getClientForAgent(context.agentId) }
      );
      console.log(`[agent-platform] Market created by "${context.agentName}" (${context.walletAccountId}): "${request.body.question}"`);
      options.eventBus.publish("market.created", { ...created.market, source: "platform", agentName: context.agentName });
      response.status(201).json(created);
    } catch (error) {
      const parts: string[] = [];
      let current: unknown = error;
      while (current instanceof Error) {
        parts.push(current.message);
        current = current.cause;
      }
      if (current && !(current instanceof Error)) parts.push(String(current));
      const fullMessage = parts.join(" — ");
      console.error(`[agent-platform] Market creation failed for "${context.agentName}": ${fullMessage}`);
      response.status(400).json({ error: fullMessage });
    }
  });

  router.post("/markets/:marketId/bets", validateBody(placeBetSchema), async (request, response) => {
    const context = request.agentContext;

    if (!context) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const bet = await placeBet(
        {
          marketId: request.params.marketId,
          bettorAccountId: context.walletAccountId,
          outcome: request.body.outcome,
          amountHbar: request.body.amountHbar
        },
        { client: options.authService.getClientForAgent(context.agentId) }
      );
      console.log(`[agent-platform] Bet by "${context.agentName}" (${context.walletAccountId}): ${request.body.outcome} ${request.body.amountHbar} HBAR on ${request.params.marketId.slice(0, 8)}`);
      options.eventBus.publish("market.bet", { ...bet, source: "platform", agentName: context.agentName });
      response.status(201).json({ bet });
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/markets/:marketId/orders", validateBody(orderSchema), async (request, response) => {
    const context = request.agentContext;

    if (!context) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const order = await publishOrder(
        {
          marketId: request.params.marketId,
          accountId: context.walletAccountId,
          outcome: request.body.outcome,
          side: request.body.side,
          quantity: request.body.quantity,
          price: request.body.price
        },
        { client: options.authService.getClientForAgent(context.agentId) }
      );
      console.log(`[agent-platform] Order by "${context.agentName}": ${request.body.side} ${request.body.quantity}x${request.body.price} ${request.body.outcome} on ${request.params.marketId.slice(0, 8)}`);
      options.eventBus.publish("market.order", { ...order, source: "platform", agentName: context.agentName });
      response.status(201).json({ order });
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/markets/:marketId/resolve", validateBody(resolveSchema), async (request, response) => {
    const context = request.agentContext;

    if (!context) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const resolution = await resolveMarket(
        {
          marketId: request.params.marketId,
          resolvedOutcome: request.body.resolvedOutcome,
          reason: request.body.reason,
          resolvedByAccountId: context.walletAccountId
        },
        { client: options.authService.getClientForAgent(context.agentId) }
      );
      console.log(`[agent-platform] Market resolved by "${context.agentName}": ${request.body.resolvedOutcome} on ${request.params.marketId.slice(0, 8)}`);
      options.eventBus.publish("market.resolved", { ...resolution, source: "platform", agentName: context.agentName });
      response.status(200).json({ resolution });
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/markets/:marketId/self-attest", validateBody(selfAttestSchema), async (request, response) => {
    const context = request.agentContext;

    if (!context) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!challengeFlowEnabled()) {
      response.status(403).json({ error: "Challenge flow is disabled by feature flag." });
      return;
    }

    try {
      const result = await selfAttestMarket(
        {
          marketId: request.params.marketId,
          proposedOutcome: request.body.proposedOutcome,
          reason: request.body.reason,
          evidence: request.body.evidence,
          challengeWindowMinutes: request.body.challengeWindowMinutes,
          attestedByAccountId: context.walletAccountId
        },
        { client: options.authService.getClientForAgent(context.agentId) }
      );
      console.log(`[agent-platform] Self-attestation by "${context.agentName}": ${request.body.proposedOutcome} on ${request.params.marketId.slice(0, 8)}`);
      options.eventBus.publish("market.self_attested", { ...result, source: "platform", agentName: context.agentName });
      response.status(200).json(result);
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.post(
    "/markets/:marketId/challenge",
    validateBody(challengeResolutionSchema),
    async (request, response) => {
      const context = request.agentContext;

      if (!context) {
        response.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (!challengeFlowEnabled()) {
        response.status(403).json({ error: "Challenge flow is disabled by feature flag." });
        return;
      }

      try {
        const result = await challengeMarketResolution(
          {
            marketId: request.params.marketId,
            proposedOutcome: request.body.proposedOutcome,
            reason: request.body.reason,
            evidence: request.body.evidence,
            challengerAccountId: context.walletAccountId
          },
          { client: options.authService.getClientForAgent(context.agentId) }
        );
        console.log(`[agent-platform] Challenge by "${context.agentName}": ${request.body.proposedOutcome} on ${request.params.marketId.slice(0, 8)}`);
        options.eventBus.publish("market.challenged", { ...result.challenge, source: "platform", agentName: context.agentName });
        response.status(201).json(result);
      } catch (error) {
        response.status(400).json({ error: (error as Error).message });
      }
    }
  );

  router.post("/markets/:marketId/oracle-vote", validateBody(oracleVoteSchema), async (request, response) => {
    const context = request.agentContext;

    if (!context) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!challengeFlowEnabled()) {
      response.status(403).json({ error: "Challenge flow is disabled by feature flag." });
      return;
    }

    try {
      const store = getMarketStore();
      const market = store.markets.get(request.params.marketId);
      const registeredActiveAgents = options.authService
        .listAgents()
        .filter((agent) => agent.status === "ACTIVE").length;
      const bettorAccountIds = (store.bets.get(request.params.marketId) ?? []).map((bet) => bet.bettorAccountId);
      const estimatedParticipants = estimateOracleParticipantCount(market, bettorAccountIds);
      const quorumPolicy = resolveOracleQuorumPolicy(Math.max(registeredActiveAgents, estimatedParticipants));
      const reputationLookup = (accountId: string): number => {
        const repStore = getReputationStore();
        const score = calculateReputationScore(accountId, repStore.attestations);
        return score.score;
      };

      const result = await submitOracleVote(
        {
          marketId: request.params.marketId,
          outcome: request.body.outcome,
          confidence: request.body.confidence,
          reason: request.body.reason,
          voterAccountId: context.walletAccountId
        },
        {
          client: options.authService.getClientForAgent(context.agentId),
          reputationLookup,
          ...quorumPolicy
        }
      );
      options.eventBus.publish("market.oracle_vote", result.vote);

      if (result.finalized) {
        options.eventBus.publish("market.resolved", result.finalized);
        const finalizedMarket = store.markets.get(request.params.marketId);
        const allVotes = deduplicateVotes(
          (finalizedMarket?.oracleVotes ?? []) as OracleVoteLog[]
        );
        const reputations = await applyOracleVoteReputation(
          request.params.marketId,
          result.finalized.resolvedOutcome,
          result.finalized.resolvedByAccountId,
          allVotes
        );
        for (const attestation of reputations) {
          options.eventBus.publish("reputation.attested", attestation);
        }
        const selfAttestationPenalty = await applySelfAttestationReputation(
          request.params.marketId,
          result.finalized.resolvedOutcome,
          result.finalized.resolvedByAccountId,
          store.markets.get(request.params.marketId)?.selfAttestation
        );
        if (selfAttestationPenalty) {
          options.eventBus.publish("reputation.attested", selfAttestationPenalty);
        }
      }

      response.status(201).json(result);
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/markets/:marketId/claims", validateBody(claimSchema), async (request, response) => {
    const context = request.agentContext;

    if (!context) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const claim = await claimWinnings(
        {
          marketId: request.params.marketId,
          accountId: context.walletAccountId,
          payoutAccountId: request.body.payoutAccountId
        },
        { client: options.authService.getClientForAgent(context.agentId) }
      );
      console.log(`[agent-platform] Winnings claimed by "${context.agentName}" on ${request.params.marketId.slice(0, 8)}`);
      options.eventBus.publish("market.claimed", { ...claim, source: "platform", agentName: context.agentName });
      response.status(201).json({ claim });
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/wallet/balance", async (request, response) => {
    const context = request.agentContext;

    if (!context) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const balance = await getBalance(context.walletAccountId, {
        client: options.authService.getClientForAgent(context.agentId)
      });
      response.status(200).json(balance);
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/wallet/faucet/request", async (request, response) => {
    const context = request.agentContext;

    if (!context) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const result = await options.faucetService.requestManualRefill(context.agentId);
      response.status(result.funded ? 201 : 200).json(result);
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
}
