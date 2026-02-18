import { Router } from "express";
import { z } from "zod";
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
import { submitAttestation, type ReputationAttestation } from "@simulacrum/reputation";

import type { ApiEventBus } from "../events.js";
import { validateBody } from "../middleware/validation.js";

function challengeFlowEnabled(): boolean {
  return (process.env.MARKET_CHALLENGE_FLOW_ENABLED ?? "true").toLowerCase() !== "false";
}

const CORRECT_VOTE_SCORE_DELTA = 6;
const INCORRECT_VOTE_SCORE_DELTA = -4;

interface OracleVoteLog {
  id: string;
  marketId: string;
  voterAccountId: string;
  outcome: string;
  confidence: number;
}

async function applyOracleVoteReputation(
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

const createMarketSchema = z.object({
  question: z.string().min(1),
  description: z.string().optional(),
  creatorAccountId: z.string().min(1),
  closeTime: z.string().min(1),
  escrowAccountId: z.string().optional(),
  outcomes: z.array(z.string().min(1)).optional(),
  initialOddsByOutcome: z.record(z.number().positive()).optional()
});

const placeBetSchema = z.object({
  bettorAccountId: z.string().min(1),
  outcome: z.string().min(1),
  amountHbar: z.number().positive()
});

const resolveMarketSchema = z.object({
  resolvedOutcome: z.string().min(1),
  resolvedByAccountId: z.string().min(1),
  reason: z.string().optional()
});

const selfAttestSchema = z.object({
  attestedByAccountId: z.string().min(1),
  proposedOutcome: z.string().min(1),
  reason: z.string().optional(),
  evidence: z.string().optional(),
  challengeWindowMinutes: z.number().int().positive().optional()
});

const challengeSchema = z.object({
  challengerAccountId: z.string().min(1),
  proposedOutcome: z.string().min(1),
  reason: z.string().min(1),
  evidence: z.string().optional()
});

const oracleVoteSchema = z.object({
  voterAccountId: z.string().min(1),
  outcome: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
  reputationScore: z.number().min(0).max(100).optional()
});

const claimSchema = z.object({
  accountId: z.string().min(1),
  payoutAccountId: z.string().optional()
});

const orderSchema = z.object({
  accountId: z.string().min(1),
  outcome: z.string().min(1),
  side: z.enum(["BID", "ASK"]),
  quantity: z.number().positive(),
  price: z.number().positive()
});

export function createMarketsRouter(eventBus: ApiEventBus): Router {
  const router = Router();

  router.get("/", (_request, response) => {
    const store = getMarketStore();

    response.json({
      markets: Array.from(store.markets.values())
    });
  });

  router.post("/", validateBody(createMarketSchema), async (request, response) => {
    try {
      const created = await createMarket(request.body);
      eventBus.publish("market.created", created.market);
      response.status(201).json(created);
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/:marketId", (request, response) => {
    const store = getMarketStore();
    const market = store.markets.get(request.params.marketId);

    if (!market) {
      response.status(404).json({ error: `Market ${request.params.marketId} not found` });
      return;
    }

    response.json({ market });
  });

  router.get("/:marketId/bets", (request, response) => {
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

    response.json({
      marketId: request.params.marketId,
      betCount: bets.length,
      totalStakedHbar: Number(totalStakedHbar.toFixed(6)),
      stakeByOutcome,
      bets
    });
  });

  router.post(
    "/:marketId/bets",
    validateBody(placeBetSchema),
    async (request, response) => {
      try {
        const bet = await placeBet({
          marketId: request.params.marketId,
          ...request.body
        });
        eventBus.publish("market.bet", bet);
        response.status(201).json({ bet });
      } catch (error) {
        response.status(400).json({ error: (error as Error).message });
      }
    }
  );

  router.post(
    "/:marketId/resolve",
    validateBody(resolveMarketSchema),
    async (request, response) => {
      try {
        const resolution = await resolveMarket({
          marketId: request.params.marketId,
          ...request.body
        });
        eventBus.publish("market.resolved", resolution);
        response.status(200).json({ resolution });
      } catch (error) {
        response.status(400).json({ error: (error as Error).message });
      }
    }
  );

  router.post(
    "/:marketId/self-attest",
    validateBody(selfAttestSchema),
    async (request, response) => {
      if (!challengeFlowEnabled()) {
        response.status(403).json({ error: "Challenge flow is disabled by feature flag." });
        return;
      }

      try {
        const result = await selfAttestMarket({
          marketId: request.params.marketId,
          ...request.body
        });
        eventBus.publish("market.self_attested", result);
        response.status(200).json(result);
      } catch (error) {
        response.status(400).json({ error: (error as Error).message });
      }
    }
  );

  router.post(
    "/:marketId/challenge",
    validateBody(challengeSchema),
    async (request, response) => {
      if (!challengeFlowEnabled()) {
        response.status(403).json({ error: "Challenge flow is disabled by feature flag." });
        return;
      }

      try {
        const result = await challengeMarketResolution({
          marketId: request.params.marketId,
          ...request.body
        });
        eventBus.publish("market.challenged", result.challenge);
        response.status(201).json(result);
      } catch (error) {
        response.status(400).json({ error: (error as Error).message });
      }
    }
  );

  router.post(
    "/:marketId/oracle-vote",
    validateBody(oracleVoteSchema),
    async (request, response) => {
      if (!challengeFlowEnabled()) {
        response.status(403).json({ error: "Challenge flow is disabled by feature flag." });
        return;
      }

      try {
        const store = getMarketStore();
        const priorVotes = [
          ...((store.markets.get(request.params.marketId)?.oracleVotes ?? []) as OracleVoteLog[])
        ];
        const result = await submitOracleVote({
          marketId: request.params.marketId,
          ...request.body
        });
        eventBus.publish("market.oracle_vote", result.vote);
        if (result.finalized) {
          eventBus.publish("market.resolved", result.finalized);
          const allVotes = [...priorVotes, result.vote];
          const uniqueVotes = Array.from(
            allVotes.reduce((map, vote) => {
              map.set(vote.id, vote);
              return map;
            }, new Map<string, OracleVoteLog>()).values()
          );
          const reputations = await applyOracleVoteReputation(
            request.params.marketId,
            result.finalized.resolvedOutcome,
            result.finalized.resolvedByAccountId,
            uniqueVotes
          );
          for (const attestation of reputations) {
            eventBus.publish("reputation.attested", attestation);
          }
        }
        response.status(201).json(result);
      } catch (error) {
        response.status(400).json({ error: (error as Error).message });
      }
    }
  );

  router.post(
    "/:marketId/claims",
    validateBody(claimSchema),
    async (request, response) => {
      try {
        const claim = await claimWinnings({
          marketId: request.params.marketId,
          ...request.body
        });
        eventBus.publish("market.claimed", claim);
        response.status(201).json({ claim });
      } catch (error) {
        response.status(400).json({ error: (error as Error).message });
      }
    }
  );

  router.post(
    "/:marketId/orders",
    validateBody(orderSchema),
    async (request, response) => {
      try {
        const order = await publishOrder({
          marketId: request.params.marketId,
          ...request.body
        });
        eventBus.publish("market.order", order);
        response.status(201).json({ order });
      } catch (error) {
        response.status(400).json({ error: (error as Error).message });
      }
    }
  );

  router.get("/:marketId/orderbook", async (request, response) => {
    try {
      const orderBook = await getOrderBook(request.params.marketId, {
        includeMirrorNode: request.query.mirror === "true"
      });
      response.status(200).json(orderBook);
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
}
