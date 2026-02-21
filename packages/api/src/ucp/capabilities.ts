import { Router } from "express";
import { z } from "zod";

import {
  createMarket,
  getMarketStore,
  getOrderBook,
  placeBet,
  resolveMarket,
  claimWinnings,
  selfAttestMarket,
  challengeMarketResolution,
  submitOracleVote,
  publishOrder
} from "@simulacrum/markets";
import {
  calculateReputationScore,
  getReputationStore,
  submitAttestation,
  buildTrustGraph
} from "@simulacrum/reputation";

import type { ApiEventBus } from "../events.js";
import { validateBody } from "../middleware/validation.js";
import { UCP_VERSION } from "./types.js";
import type { UcpCapabilityResponse } from "./types.js";

function ucpResponse<T>(
  capability: string,
  operation: string,
  result: T,
  idempotencyKey?: string
): UcpCapabilityResponse<T> {
  return {
    ucp: {
      version: UCP_VERSION,
      capabilities: [{ name: capability, version: UCP_VERSION }]
    },
    id: crypto.randomUUID(),
    status: "ok",
    capability,
    operation,
    result,
    idempotency_key: idempotencyKey,
    timestamp: new Date().toISOString()
  };
}

function ucpError(
  capability: string,
  operation: string,
  code: string,
  message: string,
  httpStatus: number,
  idempotencyKey?: string
): { status: number; body: UcpCapabilityResponse } {
  return {
    status: httpStatus,
    body: {
      ucp: {
        version: UCP_VERSION,
        capabilities: [{ name: capability, version: UCP_VERSION }]
      },
      id: crypto.randomUUID(),
      status: "error",
      capability,
      operation,
      error: { code, message },
      idempotency_key: idempotencyKey,
      timestamp: new Date().toISOString()
    }
  };
}

// ── Validation schemas ──

const createMarketSchema = z.object({
  question: z.string().min(1),
  description: z.string().optional(),
  creatorAccountId: z.string().min(1),
  escrowAccountId: z.string().min(1).optional(),
  closeTime: z.string().min(1),
  outcomes: z.array(z.string().min(1)).optional(),
  initialOddsByOutcome: z.record(z.number().positive()).optional(),
  liquidityModel: z.enum(["CLOB", "WEIGHTED_CURVE"]).optional(),
  curveLiquidityHbar: z.number().positive().optional()
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

const claimWinningsSchema = z.object({
  accountId: z.string().min(1),
  payoutAccountId: z.string().optional()
});

const selfAttestSchema = z.object({
  proposedOutcome: z.string().min(1),
  attestedByAccountId: z.string().min(1),
  reason: z.string().optional(),
  evidence: z.string().optional(),
  challengeWindowMinutes: z.number().int().positive().optional()
});

const challengeSchema = z.object({
  proposedOutcome: z.string().min(1),
  challengerAccountId: z.string().min(1),
  reason: z.string().min(1),
  evidence: z.string().optional()
});

const oracleVoteSchema = z.object({
  outcome: z.string().min(1),
  voterAccountId: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional()
});

const orderSchema = z.object({
  accountId: z.string().min(1),
  outcome: z.string().min(1),
  side: z.enum(["BID", "ASK"]),
  quantity: z.number().positive(),
  price: z.number().positive()
});

const attestSchema = z.object({
  attesterAccountId: z.string().min(1),
  subjectAccountId: z.string().min(1),
  scoreDelta: z.number(),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
  tags: z.array(z.string()).optional()
});

// ── Router ──

export interface UcpCapabilityRouterOptions {
  eventBus: ApiEventBus;
}

export function createUcpCapabilityRouter(
  options: UcpCapabilityRouterOptions
): Router {
  const router = Router();
  const CAP = "dev.simulacrum.markets.predict";
  const CAP_OB = "dev.simulacrum.markets.orderbook";
  const CAP_RES = "dev.simulacrum.markets.resolve";
  const CAP_DISP = "dev.simulacrum.markets.dispute";
  const CAP_REP = "dev.simulacrum.reputation.score";
  const CAP_ATT = "dev.simulacrum.reputation.attest";
  const CAP_TRUST = "dev.simulacrum.reputation.trust_graph";

  // ── Markets: predict capability ──

  router.get("/markets", (_request, response) => {
    const store = getMarketStore();
    const markets = Array.from(store.markets.values());

    response.json(
      ucpResponse(CAP, "list_markets", { markets })
    );
  });

  router.get("/markets/:marketId", (request, response) => {
    const store = getMarketStore();
    const market = store.markets.get(request.params.marketId);

    if (!market) {
      const err = ucpError(
        CAP, "get_market", "NOT_FOUND",
        `Market ${request.params.marketId} not found`, 404
      );
      response.status(err.status).json(err.body);
      return;
    }

    response.json(ucpResponse(CAP, "get_market", { market }));
  });

  router.get("/markets/:marketId/bets", (request, response) => {
    const store = getMarketStore();
    const market = store.markets.get(request.params.marketId);

    if (!market) {
      const err = ucpError(
        CAP, "list_bets", "NOT_FOUND",
        `Market ${request.params.marketId} not found`, 404
      );
      response.status(err.status).json(err.body);
      return;
    }

    const bets = store.bets.get(request.params.marketId) ?? [];
    const stakeByOutcome: Record<string, number> = {};
    let totalStakedHbar = 0;

    for (const outcome of market.outcomes) {
      stakeByOutcome[outcome] = 0;
    }

    for (const bet of bets) {
      totalStakedHbar += bet.amountHbar;
      if (bet.outcome in stakeByOutcome) {
        stakeByOutcome[bet.outcome] += bet.amountHbar;
      }
    }

    response.json(
      ucpResponse(CAP, "list_bets", {
        marketId: request.params.marketId,
        betCount: bets.length,
        totalStakedHbar: Number(totalStakedHbar.toFixed(6)),
        stakeByOutcome,
        bets
      })
    );
  });

  router.post(
    "/markets",
    validateBody(createMarketSchema),
    async (request, response) => {
      const idempotencyKey = request.get("idempotency-key");

      try {
        const created = await createMarket({
          question: request.body.question,
          description: request.body.description,
          creatorAccountId: request.body.creatorAccountId,
          escrowAccountId: request.body.escrowAccountId,
          closeTime: request.body.closeTime,
          outcomes: request.body.outcomes,
          initialOddsByOutcome: request.body.initialOddsByOutcome,
          liquidityModel: request.body.liquidityModel,
          curveLiquidityHbar: request.body.curveLiquidityHbar
        });

        options.eventBus.publish("market.created", {
          ...created.market,
          source: "ucp"
        });

        response
          .status(201)
          .json(ucpResponse(CAP, "create_market", created, idempotencyKey));
      } catch (error) {
        const err = ucpError(
          CAP, "create_market", "CREATE_FAILED",
          (error as Error).message, 400, idempotencyKey
        );
        response.status(err.status).json(err.body);
      }
    }
  );

  router.post(
    "/markets/:marketId/bets",
    validateBody(placeBetSchema),
    async (request, response) => {
      const idempotencyKey = request.get("idempotency-key");

      try {
        const bet = await placeBet({
          marketId: request.params.marketId,
          bettorAccountId: request.body.bettorAccountId,
          outcome: request.body.outcome,
          amountHbar: request.body.amountHbar
        });

        options.eventBus.publish("market.bet", {
          ...bet,
          source: "ucp"
        });

        response
          .status(201)
          .json(ucpResponse(CAP, "place_bet", { bet }, idempotencyKey));
      } catch (error) {
        const err = ucpError(
          CAP, "place_bet", "BET_FAILED",
          (error as Error).message, 400, idempotencyKey
        );
        response.status(err.status).json(err.body);
      }
    }
  );

  // ── Markets: orderbook capability ──

  router.get("/markets/:marketId/orderbook", async (request, response) => {
    try {
      const orderBook = await getOrderBook(request.params.marketId, {
        includeMirrorNode: request.query.mirror === "true"
      });
      response.json(ucpResponse(CAP_OB, "get_orderbook", orderBook));
    } catch (error) {
      const err = ucpError(
        CAP_OB, "get_orderbook", "ORDERBOOK_ERROR",
        (error as Error).message, 400
      );
      response.status(err.status).json(err.body);
    }
  });

  router.post(
    "/markets/:marketId/orders",
    validateBody(orderSchema),
    async (request, response) => {
      const idempotencyKey = request.get("idempotency-key");

      try {
        const order = await publishOrder({
          marketId: request.params.marketId,
          accountId: request.body.accountId,
          outcome: request.body.outcome,
          side: request.body.side,
          quantity: request.body.quantity,
          price: request.body.price
        });

        options.eventBus.publish("market.order", {
          ...order,
          source: "ucp"
        });

        response
          .status(201)
          .json(ucpResponse(CAP_OB, "publish_order", { order }, idempotencyKey));
      } catch (error) {
        const err = ucpError(
          CAP_OB, "publish_order", "ORDER_FAILED",
          (error as Error).message, 400, idempotencyKey
        );
        response.status(err.status).json(err.body);
      }
    }
  );

  // ── Markets: resolve capability ──

  router.post(
    "/markets/:marketId/resolve",
    validateBody(resolveMarketSchema),
    async (request, response) => {
      const idempotencyKey = request.get("idempotency-key");

      try {
        const resolution = await resolveMarket({
          marketId: request.params.marketId,
          resolvedOutcome: request.body.resolvedOutcome,
          reason: request.body.reason,
          resolvedByAccountId: request.body.resolvedByAccountId
        });

        options.eventBus.publish("market.resolved", {
          ...resolution,
          source: "ucp"
        });

        response.json(
          ucpResponse(CAP_RES, "resolve_market", { resolution }, idempotencyKey)
        );
      } catch (error) {
        const err = ucpError(
          CAP_RES, "resolve_market", "RESOLVE_FAILED",
          (error as Error).message, 400, idempotencyKey
        );
        response.status(err.status).json(err.body);
      }
    }
  );

  router.post(
    "/markets/:marketId/claims",
    validateBody(claimWinningsSchema),
    async (request, response) => {
      const idempotencyKey = request.get("idempotency-key");

      try {
        const claim = await claimWinnings({
          marketId: request.params.marketId,
          accountId: request.body.accountId,
          payoutAccountId: request.body.payoutAccountId
        });

        options.eventBus.publish("market.claimed", {
          ...claim,
          source: "ucp"
        });

        response
          .status(201)
          .json(ucpResponse(CAP_RES, "claim_winnings", { claim }, idempotencyKey));
      } catch (error) {
        const err = ucpError(
          CAP_RES, "claim_winnings", "CLAIM_FAILED",
          (error as Error).message, 400, idempotencyKey
        );
        response.status(err.status).json(err.body);
      }
    }
  );

  // ── Markets: dispute capability ──

  router.post(
    "/markets/:marketId/self-attest",
    validateBody(selfAttestSchema),
    async (request, response) => {
      const idempotencyKey = request.get("idempotency-key");

      try {
        const result = await selfAttestMarket({
          marketId: request.params.marketId,
          proposedOutcome: request.body.proposedOutcome,
          attestedByAccountId: request.body.attestedByAccountId,
          reason: request.body.reason,
          evidence: request.body.evidence,
          challengeWindowMinutes: request.body.challengeWindowMinutes
        });

        options.eventBus.publish("market.self_attested", {
          ...result,
          source: "ucp"
        });

        response.json(
          ucpResponse(CAP_DISP, "self_attest", result, idempotencyKey)
        );
      } catch (error) {
        const err = ucpError(
          CAP_DISP, "self_attest", "ATTEST_FAILED",
          (error as Error).message, 400, idempotencyKey
        );
        response.status(err.status).json(err.body);
      }
    }
  );

  router.post(
    "/markets/:marketId/challenge",
    validateBody(challengeSchema),
    async (request, response) => {
      const idempotencyKey = request.get("idempotency-key");

      try {
        const result = await challengeMarketResolution({
          marketId: request.params.marketId,
          proposedOutcome: request.body.proposedOutcome,
          challengerAccountId: request.body.challengerAccountId,
          reason: request.body.reason,
          evidence: request.body.evidence
        });

        options.eventBus.publish("market.challenged", {
          ...result.challenge,
          source: "ucp"
        });

        response
          .status(201)
          .json(ucpResponse(CAP_DISP, "challenge", result, idempotencyKey));
      } catch (error) {
        const err = ucpError(
          CAP_DISP, "challenge", "CHALLENGE_FAILED",
          (error as Error).message, 400, idempotencyKey
        );
        response.status(err.status).json(err.body);
      }
    }
  );

  router.post(
    "/markets/:marketId/oracle-vote",
    validateBody(oracleVoteSchema),
    async (request, response) => {
      const idempotencyKey = request.get("idempotency-key");

      try {
        const result = await submitOracleVote({
          marketId: request.params.marketId,
          outcome: request.body.outcome,
          voterAccountId: request.body.voterAccountId,
          confidence: request.body.confidence,
          reason: request.body.reason
        });

        options.eventBus.publish("market.oracle_vote", result.vote);

        if (result.finalized) {
          options.eventBus.publish("market.resolved", result.finalized);
        }

        response
          .status(201)
          .json(ucpResponse(CAP_DISP, "oracle_vote", result, idempotencyKey));
      } catch (error) {
        const err = ucpError(
          CAP_DISP, "oracle_vote", "VOTE_FAILED",
          (error as Error).message, 400, idempotencyKey
        );
        response.status(err.status).json(err.body);
      }
    }
  );

  // ── Reputation: score capability ──
  // Static paths must be registered before parameterized paths to avoid shadowing.

  router.get("/reputation/leaderboard", (_request, response) => {
    try {
      const repStore = getReputationStore();
      const accounts = new Set<string>();

      for (const att of repStore.attestations) {
        accounts.add(att.subjectAccountId);
      }

      const entries = Array.from(accounts).map((accountId) => {
        const score = calculateReputationScore(
          accountId,
          repStore.attestations
        );

        return {
          accountId,
          score: score.score,
          rawScore: score.rawScore,
          confidence: score.confidence,
          attestationCount: score.attestationCount
        };
      });

      entries.sort((a, b) => b.score - a.score);

      response.json(
        ucpResponse(CAP_REP, "leaderboard", { entries })
      );
    } catch (error) {
      const err = ucpError(
        CAP_REP, "leaderboard", "LEADERBOARD_ERROR",
        (error as Error).message, 400
      );
      response.status(err.status).json(err.body);
    }
  });

  // ── Reputation: trust graph capability ──

  router.get("/reputation/trust-graph", (_request, response) => {
    try {
      const repStore = getReputationStore();
      const graph = buildTrustGraph(repStore.attestations);

      response.json(
        ucpResponse(CAP_TRUST, "get_trust_graph", graph)
      );
    } catch (error) {
      const err = ucpError(
        CAP_TRUST, "get_trust_graph", "GRAPH_ERROR",
        (error as Error).message, 400
      );
      response.status(err.status).json(err.body);
    }
  });

  // ── Reputation: attest capability ──

  router.post(
    "/reputation/attestations",
    validateBody(attestSchema),
    async (request, response) => {
      const idempotencyKey = request.get("idempotency-key");

      try {
        const attestation = await submitAttestation({
          attesterAccountId: request.body.attesterAccountId,
          subjectAccountId: request.body.subjectAccountId,
          scoreDelta: request.body.scoreDelta,
          confidence: request.body.confidence,
          reason: request.body.reason,
          tags: request.body.tags
        });

        options.eventBus.publish("reputation.attested", {
          ...attestation,
          source: "ucp"
        });

        response
          .status(201)
          .json(
            ucpResponse(CAP_ATT, "submit_attestation", { attestation }, idempotencyKey)
          );
      } catch (error) {
        const err = ucpError(
          CAP_ATT, "submit_attestation", "ATTESTATION_FAILED",
          (error as Error).message, 400, idempotencyKey
        );
        response.status(err.status).json(err.body);
      }
    }
  );

  // Parameterized route last — after all static /reputation/* paths.
  router.get("/reputation/:accountId", (request, response) => {
    try {
      const repStore = getReputationStore();
      const score = calculateReputationScore(
        request.params.accountId,
        repStore.attestations
      );

      response.json(
        ucpResponse(CAP_REP, "get_score", score)
      );
    } catch (error) {
      const err = ucpError(
        CAP_REP, "get_score", "SCORE_ERROR",
        (error as Error).message, 400
      );
      response.status(err.status).json(err.body);
    }
  });

  return router;
}
