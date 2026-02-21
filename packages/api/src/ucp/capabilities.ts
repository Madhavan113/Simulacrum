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
import {
  getServiceStore,
  registerService,
  requestService,
  acceptRequest,
  completeRequest,
  reviewService
} from "@simulacrum/services";
import {
  getTaskStore,
  createTask,
  bidOnTask,
  acceptBid,
  submitWork,
  approveWork
} from "@simulacrum/tasks";

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
  liquidityModel: z.enum(["CLOB", "WEIGHTED_CURVE", "HIGH_LIQUIDITY", "LOW_LIQUIDITY"]).optional(),
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

  // ── Services: registry capability ──

  const CAP_SVC = "dev.simulacrum.services.registry";
  const CAP_SVC_INV = "dev.simulacrum.services.invoke";
  const CAP_SVC_REV = "dev.simulacrum.services.review";

  const ucpRegisterServiceSchema = z.object({
    providerAccountId: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    category: z.enum(["COMPUTE", "DATA", "RESEARCH", "ANALYSIS", "ORACLE", "CUSTOM"]),
    priceHbar: z.number().positive(),
    tags: z.array(z.string()).optional()
  });

  const ucpRequestServiceSchema = z.object({
    requesterAccountId: z.string().min(1),
    input: z.string().min(1)
  });

  const ucpAcceptRequestSchema = z.object({
    providerAccountId: z.string().min(1)
  });

  const ucpCompleteRequestSchema = z.object({
    providerAccountId: z.string().min(1),
    output: z.string().min(1)
  });

  const ucpReviewServiceSchema = z.object({
    serviceRequestId: z.string().min(1),
    reviewerAccountId: z.string().min(1),
    rating: z.number().int().min(1).max(5),
    comment: z.string().min(1)
  });

  router.get("/services", (_request, response) => {
    const store = getServiceStore();
    const services = Array.from(store.services.values());
    response.json(ucpResponse(CAP_SVC, "list_services", { services }));
  });

  router.get("/services/:serviceId", (request, response) => {
    const store = getServiceStore();
    const service = store.services.get(request.params.serviceId);
    if (!service) {
      const err = ucpError(CAP_SVC, "get_service", "NOT_FOUND", `Service ${request.params.serviceId} not found`, 404);
      response.status(err.status).json(err.body);
      return;
    }
    const reviews = store.reviews.get(request.params.serviceId) ?? [];
    response.json(ucpResponse(CAP_SVC, "get_service", { service, reviews }));
  });

  router.post("/services", validateBody(ucpRegisterServiceSchema), async (request, response) => {
    const idempotencyKey = request.get("x-idempotency-key");
    try {
      const result = await registerService(request.body);
      options.eventBus.publish("service.registered", { ...result.service, source: "ucp" });
      response.status(201).json(ucpResponse(CAP_SVC, "register_service", result, idempotencyKey));
    } catch (error) {
      const err = ucpError(CAP_SVC, "register_service", "REGISTER_FAILED", (error as Error).message, 400, idempotencyKey);
      response.status(err.status).json(err.body);
    }
  });

  router.post("/services/:serviceId/request", validateBody(ucpRequestServiceSchema), async (request, response) => {
    const idempotencyKey = request.get("x-idempotency-key");
    try {
      const serviceRequest = await requestService({ serviceId: request.params.serviceId, ...request.body });
      options.eventBus.publish("service.requested", { ...serviceRequest, source: "ucp" });
      response.status(201).json(ucpResponse(CAP_SVC_INV, "request_service", serviceRequest, idempotencyKey));
    } catch (error) {
      const err = ucpError(CAP_SVC_INV, "request_service", "REQUEST_FAILED", (error as Error).message, 400, idempotencyKey);
      response.status(err.status).json(err.body);
    }
  });

  router.post("/services/:serviceId/requests/:requestId/accept", validateBody(ucpAcceptRequestSchema), async (request, response) => {
    const idempotencyKey = request.get("x-idempotency-key");
    try {
      const serviceRequest = await acceptRequest({ serviceId: request.params.serviceId, requestId: request.params.requestId, ...request.body });
      options.eventBus.publish("service.accepted", { ...serviceRequest, source: "ucp" });
      response.json(ucpResponse(CAP_SVC_INV, "accept_request", serviceRequest, idempotencyKey));
    } catch (error) {
      const err = ucpError(CAP_SVC_INV, "accept_request", "ACCEPT_FAILED", (error as Error).message, 400, idempotencyKey);
      response.status(err.status).json(err.body);
    }
  });

  router.post("/services/:serviceId/requests/:requestId/complete", validateBody(ucpCompleteRequestSchema), async (request, response) => {
    const idempotencyKey = request.get("x-idempotency-key");
    try {
      const serviceRequest = await completeRequest({ serviceId: request.params.serviceId, requestId: request.params.requestId, ...request.body });
      options.eventBus.publish("service.completed", { ...serviceRequest, source: "ucp" });
      response.json(ucpResponse(CAP_SVC_INV, "complete_request", serviceRequest, idempotencyKey));
    } catch (error) {
      const err = ucpError(CAP_SVC_INV, "complete_request", "COMPLETE_FAILED", (error as Error).message, 400, idempotencyKey);
      response.status(err.status).json(err.body);
    }
  });

  router.post("/services/:serviceId/reviews", validateBody(ucpReviewServiceSchema), async (request, response) => {
    const idempotencyKey = request.get("x-idempotency-key");
    try {
      const review = await reviewService({ serviceId: request.params.serviceId, ...request.body });
      options.eventBus.publish("service.reviewed", { ...review, source: "ucp" });
      response.status(201).json(ucpResponse(CAP_SVC_REV, "review_service", review, idempotencyKey));
    } catch (error) {
      const err = ucpError(CAP_SVC_REV, "review_service", "REVIEW_FAILED", (error as Error).message, 400, idempotencyKey);
      response.status(err.status).json(err.body);
    }
  });

  // ── Tasks: board capability ──

  const CAP_TASK = "dev.simulacrum.tasks.board";
  const CAP_TASK_BID = "dev.simulacrum.tasks.bid";
  const CAP_TASK_DEL = "dev.simulacrum.tasks.deliver";

  const ucpCreateTaskSchema = z.object({
    posterAccountId: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    category: z.enum(["RESEARCH", "PREDICTION", "DATA_COLLECTION", "ANALYSIS", "DEVELOPMENT", "CUSTOM"]),
    bountyHbar: z.number().positive(),
    deadline: z.string().min(1),
    requiredReputation: z.number().min(0).optional(),
    maxBids: z.number().int().positive().optional()
  });

  const ucpBidSchema = z.object({
    bidderAccountId: z.string().min(1),
    proposedPriceHbar: z.number().positive(),
    estimatedCompletion: z.string().min(1),
    proposal: z.string().min(1)
  });

  const ucpAcceptBidSchema = z.object({
    posterAccountId: z.string().min(1)
  });

  const ucpSubmitWorkSchema = z.object({
    submitterAccountId: z.string().min(1),
    deliverable: z.string().min(1)
  });

  const ucpApproveWorkSchema = z.object({
    posterAccountId: z.string().min(1)
  });

  router.get("/tasks", (request, response) => {
    const store = getTaskStore();
    let tasks = Array.from(store.tasks.values());
    const status = request.query.status as string | undefined;
    if (status) tasks = tasks.filter((t) => t.status === status);
    response.json(ucpResponse(CAP_TASK, "list_tasks", { tasks }));
  });

  router.get("/tasks/:taskId", (request, response) => {
    const store = getTaskStore();
    const task = store.tasks.get(request.params.taskId);
    if (!task) {
      const err = ucpError(CAP_TASK, "get_task", "NOT_FOUND", `Task ${request.params.taskId} not found`, 404);
      response.status(err.status).json(err.body);
      return;
    }
    const bids = store.bids.get(request.params.taskId) ?? [];
    const submissions = store.submissions.get(request.params.taskId) ?? [];
    response.json(ucpResponse(CAP_TASK, "get_task", { task, bids, submissions }));
  });

  router.post("/tasks", validateBody(ucpCreateTaskSchema), async (request, response) => {
    const idempotencyKey = request.get("x-idempotency-key");
    try {
      const result = await createTask(request.body);
      options.eventBus.publish("task.created", { ...result.task, source: "ucp" });
      response.status(201).json(ucpResponse(CAP_TASK, "create_task", result, idempotencyKey));
    } catch (error) {
      const err = ucpError(CAP_TASK, "create_task", "CREATE_FAILED", (error as Error).message, 400, idempotencyKey);
      response.status(err.status).json(err.body);
    }
  });

  router.post("/tasks/:taskId/bid", validateBody(ucpBidSchema), async (request, response) => {
    const idempotencyKey = request.get("x-idempotency-key");
    try {
      const bid = await bidOnTask({ taskId: request.params.taskId, ...request.body });
      options.eventBus.publish("task.bid", { ...bid, source: "ucp" });
      response.status(201).json(ucpResponse(CAP_TASK_BID, "bid_on_task", bid, idempotencyKey));
    } catch (error) {
      const err = ucpError(CAP_TASK_BID, "bid_on_task", "BID_FAILED", (error as Error).message, 400, idempotencyKey);
      response.status(err.status).json(err.body);
    }
  });

  router.post("/tasks/:taskId/bids/:bidId/accept", validateBody(ucpAcceptBidSchema), async (request, response) => {
    const idempotencyKey = request.get("x-idempotency-key");
    try {
      const result = await acceptBid({ taskId: request.params.taskId, bidId: request.params.bidId, ...request.body });
      options.eventBus.publish("task.assigned", { ...result, source: "ucp" });
      response.json(ucpResponse(CAP_TASK_BID, "accept_bid", result, idempotencyKey));
    } catch (error) {
      const err = ucpError(CAP_TASK_BID, "accept_bid", "ACCEPT_FAILED", (error as Error).message, 400, idempotencyKey);
      response.status(err.status).json(err.body);
    }
  });

  router.post("/tasks/:taskId/submit", validateBody(ucpSubmitWorkSchema), async (request, response) => {
    const idempotencyKey = request.get("x-idempotency-key");
    try {
      const submission = await submitWork({ taskId: request.params.taskId, ...request.body });
      options.eventBus.publish("task.submitted", { ...submission, source: "ucp" });
      response.status(201).json(ucpResponse(CAP_TASK_DEL, "submit_work", submission, idempotencyKey));
    } catch (error) {
      const err = ucpError(CAP_TASK_DEL, "submit_work", "SUBMIT_FAILED", (error as Error).message, 400, idempotencyKey);
      response.status(err.status).json(err.body);
    }
  });

  router.post("/tasks/:taskId/approve", validateBody(ucpApproveWorkSchema), async (request, response) => {
    const idempotencyKey = request.get("x-idempotency-key");
    try {
      const task = await approveWork({ taskId: request.params.taskId, ...request.body });
      options.eventBus.publish("task.completed", { ...task, source: "ucp" });
      response.json(ucpResponse(CAP_TASK_DEL, "approve_work", task, idempotencyKey));
    } catch (error) {
      const err = ucpError(CAP_TASK_DEL, "approve_work", "APPROVE_FAILED", (error as Error).message, 400, idempotencyKey);
      response.status(err.status).json(err.body);
    }
  });

  return router;
}
