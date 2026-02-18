import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const marketState = vi.hoisted(() => ({
  markets: new Map<string, Record<string, unknown>>(),
  counter: 1
}));

const reputationState = vi.hoisted(() => ({
  topicId: "0.0.9100",
  topicUrl: "https://hashscan.io/testnet/topic/0.0.9100",
  attestations: [] as Array<Record<string, unknown>>,
  tokenId: "0.0.9001"
}));

const insuranceState = vi.hoisted(() => ({
  pools: new Map<string, Record<string, unknown>>(),
  policies: new Map<string, Record<string, unknown>>(),
  poolCounter: 1,
  policyCounter: 1
}));

vi.mock("@simulacrum/markets", () => ({
  getMarketStore: () => ({ markets: marketState.markets }),
  createMarket: vi.fn(async (input: Record<string, unknown>) => {
    const id = `0.0.70${marketState.counter}`;
    marketState.counter += 1;

    const market = {
      id,
      question: input.question,
      description: input.description,
      creatorAccountId: input.creatorAccountId,
      escrowAccountId: input.escrowAccountId ?? input.creatorAccountId,
      topicId: id,
      topicUrl: `https://hashscan.io/testnet/topic/${id}`,
      closeTime: input.closeTime,
      createdAt: "2026-02-18T00:00:00.000Z",
      status: "OPEN",
      outcomes: input.outcomes ?? ["YES", "NO"],
      outcomeTokenIds: { YES: "0.0.8101", NO: "0.0.8102" },
      outcomeTokenUrls: {
        YES: "https://hashscan.io/testnet/token/0.0.8101",
        NO: "https://hashscan.io/testnet/token/0.0.8102"
      }
    };

    marketState.markets.set(id, market);

    return {
      market,
      topicTransactionId: `tx-${id}`,
      topicTransactionUrl: `https://hashscan.io/testnet/transaction/tx-${id}`
    };
  }),
  placeBet: vi.fn(async (input: Record<string, unknown>) => ({
    id: "bet-1",
    marketId: input.marketId,
    bettorAccountId: input.bettorAccountId,
    outcome: input.outcome,
    amountHbar: input.amountHbar,
    placedAt: "2026-02-18T00:01:00.000Z"
  })),
  resolveMarket: vi.fn(async (input: Record<string, unknown>) => {
    const marketId = String(input.marketId);
    const market = marketState.markets.get(marketId);

    if (market) {
      market.status = "RESOLVED";
      market.resolvedOutcome = input.resolvedOutcome;
    }

    return {
      marketId,
      resolvedOutcome: input.resolvedOutcome,
      resolvedByAccountId: input.resolvedByAccountId,
      resolvedAt: "2026-02-18T00:02:00.000Z"
    };
  }),
  selfAttestMarket: vi.fn(async (input: Record<string, unknown>) => ({
    marketId: input.marketId,
    challengeWindowEndsAt: "2026-02-18T00:06:00.000Z",
    selfAttestation: {
      proposedOutcome: input.proposedOutcome,
      attestedByAccountId: input.attestedByAccountId,
      reason: input.reason,
      evidence: input.evidence,
      attestedAt: "2026-02-18T00:05:00.000Z"
    }
  })),
  challengeMarketResolution: vi.fn(async (input: Record<string, unknown>) => ({
    challenge: {
      id: "challenge-1",
      marketId: input.marketId,
      challengerAccountId: input.challengerAccountId,
      proposedOutcome: input.proposedOutcome,
      reason: input.reason,
      evidence: input.evidence,
      createdAt: "2026-02-18T00:05:30.000Z"
    }
  })),
  submitOracleVote: vi.fn(async (input: Record<string, unknown>) => ({
    vote: {
      id: "oracle-vote-1",
      marketId: input.marketId,
      voterAccountId: input.voterAccountId,
      outcome: input.outcome,
      confidence: input.confidence ?? 0.5,
      reason: input.reason,
      createdAt: "2026-02-18T00:05:45.000Z"
    }
  })),
  claimWinnings: vi.fn(async (input: Record<string, unknown>) => ({
    id: "claim-1",
    marketId: input.marketId,
    accountId: input.accountId,
    payoutHbar: 10,
    createdAt: "2026-02-18T00:03:00.000Z"
  })),
  publishOrder: vi.fn(async (input: Record<string, unknown>) => ({
    id: "order-1",
    marketId: input.marketId,
    accountId: input.accountId,
    outcome: input.outcome,
    side: input.side,
    quantity: input.quantity,
    price: input.price,
    createdAt: "2026-02-18T00:04:00.000Z",
    status: "OPEN"
  })),
  getOrderBook: vi.fn(async (marketId: string) => ({
    marketId,
    orders: [],
    bids: [],
    asks: []
  }))
}));

vi.mock("@simulacrum/reputation", () => ({
  createRepToken: vi.fn(async (input: Record<string, unknown>) => ({
    tokenId: reputationState.tokenId,
    tokenUrl: `https://hashscan.io/testnet/token/${reputationState.tokenId}`,
    treasuryAccountId: input.treasuryAccountId,
    createdAt: "2026-02-18T00:00:00.000Z",
    transactionId: "tx-rep-token",
    transactionUrl: "https://hashscan.io/testnet/transaction/tx-rep-token"
  })),
  submitAttestation: vi.fn(async (input: Record<string, unknown>) => {
    const attestation = {
      id: `att-${reputationState.attestations.length + 1}`,
      topicId: reputationState.topicId,
      topicUrl: reputationState.topicUrl,
      subjectAccountId: input.subjectAccountId,
      attesterAccountId: input.attesterAccountId,
      scoreDelta: input.scoreDelta,
      confidence: input.confidence ?? 0.7,
      reason: input.reason,
      tags: input.tags ?? [],
      createdAt: "2026-02-18T00:10:00.000Z"
    };

    reputationState.attestations.push(attestation);
    return attestation;
  }),
  listAttestations: vi.fn(async () => reputationState.attestations),
  getReputationStore: () => ({
    topicId: reputationState.topicId,
    topicUrl: reputationState.topicUrl,
    attestations: reputationState.attestations
  }),
  calculateReputationScore: vi.fn((accountId: string, attestations: Array<Record<string, unknown>>) => {
    const scoreDelta = attestations
      .filter((attestation) => attestation.subjectAccountId === accountId)
      .reduce((sum, attestation) => sum + Number(attestation.scoreDelta ?? 0), 0);

    return {
      accountId,
      score: 50 + scoreDelta,
      rawScore: 50 + scoreDelta,
      attestationCount: attestations.filter((attestation) => attestation.subjectAccountId === accountId)
        .length,
      confidence: 0.8
    };
  }),
  buildReputationLeaderboard: vi.fn((attestations: Array<Record<string, unknown>>) => {
    const subjects = new Set(attestations.map((attestation) => String(attestation.subjectAccountId)));

    return Array.from(subjects).map((subject) => ({
      accountId: subject,
      score: 60,
      rawScore: 60,
      attestationCount: 1,
      confidence: 0.8
    }));
  }),
  buildTrustGraph: vi.fn((attestations: Array<Record<string, unknown>>) => ({
    nodes: Array.from(
      new Set(
        attestations.flatMap((attestation) => [
          String(attestation.subjectAccountId),
          String(attestation.attesterAccountId)
        ])
      )
    ),
    edges: attestations.map((attestation) => ({
      from: String(attestation.attesterAccountId),
      to: String(attestation.subjectAccountId),
      weight: Number(attestation.scoreDelta ?? 0),
      attestations: 1
    })),
    adjacency: {}
  }))
}));

vi.mock("@simulacrum/insurance", () => ({
  getInsuranceStore: () => ({
    pools: insuranceState.pools,
    policies: insuranceState.policies
  }),
  createInsurancePool: vi.fn(async (managerAccountId: string, escrowAccountId: string, initialLiquidityHbar: number) => {
    const id = `pool-${insuranceState.poolCounter}`;
    insuranceState.poolCounter += 1;

    const pool = {
      id,
      managerAccountId,
      escrowAccountId,
      liquidityHbar: initialLiquidityHbar,
      reservedHbar: 0,
      createdAt: "2026-02-18T00:00:00.000Z",
      updatedAt: "2026-02-18T00:00:00.000Z"
    };

    insuranceState.pools.set(id, pool);
    return pool;
  }),
  depositLiquidity: vi.fn(async (poolId: string, _accountId: string, amountHbar: number) => {
    const pool = insuranceState.pools.get(poolId);

    if (!pool) {
      throw new Error(`Pool ${poolId} not found`);
    }

    pool.liquidityHbar = Number(pool.liquidityHbar) + amountHbar;
    return pool;
  }),
  reserveCoverage: vi.fn((poolId: string, amountHbar: number) => {
    const pool = insuranceState.pools.get(poolId);

    if (!pool) {
      throw new Error(`Pool ${poolId} not found`);
    }

    pool.reservedHbar = Number(pool.reservedHbar) + amountHbar;
    return pool;
  }),
  underwriteCommitment: vi.fn(async (input: Record<string, unknown>) => {
    const id = `policy-${insuranceState.policyCounter}`;
    insuranceState.policyCounter += 1;

    const policy = {
      id,
      marketId: input.marketId,
      underwriterAccountId: input.underwriterAccountId,
      beneficiaryAccountId: input.beneficiaryAccountId,
      escrowAccountId: input.escrowAccountId ?? input.underwriterAccountId,
      coverageAmountHbar: input.coverageAmountHbar,
      premiumAmountHbar: 5,
      premiumRateBps: input.premiumRateBps,
      expirationTime: input.expirationTime,
      createdAt: "2026-02-18T00:00:00.000Z",
      status: "ACTIVE"
    };

    insuranceState.policies.set(id, policy);
    return policy;
  }),
  processClaim: vi.fn(async (input: Record<string, unknown>) => {
    const policy = insuranceState.policies.get(String(input.policyId));

    if (!policy) {
      throw new Error(`Policy ${input.policyId} not found`);
    }

    policy.status = "CLAIMED";
    return policy;
  })
}));

import { createApiServer, type ApiServer } from "./server.js";

describe("API smoke", () => {
  let server: ApiServer | null = null;

  beforeEach(() => {
    marketState.markets.clear();
    marketState.counter = 1;

    reputationState.attestations.length = 0;

    insuranceState.pools.clear();
    insuranceState.policies.clear();
    insuranceState.poolCounter = 1;
    insuranceState.policyCounter = 1;
  });

  afterEach(async () => {
    if (server) {
      await server.stop().catch(() => {
        // Stop can fail if server wasn't started.
      });
    }

    server = null;
  });

  it("runs end-to-end smoke workflow across core endpoint groups", async () => {
    server = createApiServer();
    const api = request(server.app);

    const health = await api.get("/health");
    expect(health.status).toBe(200);

    const createdAgent = await api.post("/agents").send({
      name: "Smoke Agent",
      accountId: "0.0.1001",
      bankrollHbar: 100,
      strategy: "random"
    });
    expect(createdAgent.status).toBe(201);
    const agentId = createdAgent.body.agent.id as string;

    const listAgents = await api.get("/agents");
    expect(listAgents.status).toBe(200);
    expect(listAgents.body.agents.length).toBe(1);

    const decision = await api.post(`/agents/${agentId}/decide`).send({
      market: {
        id: "0.0.7001",
        question: "Smoke market",
        creatorAccountId: "0.0.1001",
        outcomes: ["YES", "NO"],
        status: "OPEN",
        closeTime: "2026-12-31T00:00:00.000Z"
      },
      context: {
        now: "2026-02-18T00:00:00.000Z",
        reputationByAccount: {},
        marketSentiment: {}
      }
    });
    expect(decision.status).toBe(200);

    const simulation = await api.post("/agents/simulate").send({
      rounds: 1,
      markets: [
        {
          id: "0.0.7001",
          question: "Sim market",
          creatorAccountId: "0.0.1001",
          outcomes: ["YES", "NO"],
          status: "OPEN",
          closeTime: "2026-12-31T00:00:00.000Z"
        }
      ]
    });
    expect(simulation.status).toBe(200);

    const createdMarket = await api.post("/markets").send({
      question: "Will smoke pass?",
      creatorAccountId: "0.0.1001",
      closeTime: "2026-12-31T00:00:00.000Z"
    });
    expect(createdMarket.status).toBe(201);
    const marketId = createdMarket.body.market.id as string;

    const listedMarkets = await api.get("/markets");
    expect(listedMarkets.status).toBe(200);
    expect(listedMarkets.body.markets.length).toBe(1);

    const loadedMarket = await api.get(`/markets/${marketId}`);
    expect(loadedMarket.status).toBe(200);

    const bet = await api.post(`/markets/${marketId}/bets`).send({
      bettorAccountId: "0.0.1001",
      outcome: "YES",
      amountHbar: 5
    });
    expect(bet.status).toBe(201);

    const order = await api.post(`/markets/${marketId}/orders`).send({
      accountId: "0.0.1001",
      outcome: "YES",
      side: "BID",
      quantity: 2,
      price: 0.63
    });
    expect(order.status).toBe(201);

    const book = await api.get(`/markets/${marketId}/orderbook`);
    expect(book.status).toBe(200);

    const resolved = await api.post(`/markets/${marketId}/resolve`).send({
      resolvedOutcome: "YES",
      resolvedByAccountId: "0.0.1001"
    });
    expect(resolved.status).toBe(200);

    const claim = await api.post(`/markets/${marketId}/claims`).send({
      accountId: "0.0.1001"
    });
    expect(claim.status).toBe(201);

    const repToken = await api.post("/reputation/token").send({
      treasuryAccountId: "0.0.1001"
    });
    expect(repToken.status).toBe(201);

    const attested = await api.post("/reputation/attestations").send({
      subjectAccountId: "0.0.1001",
      attesterAccountId: "0.0.2002",
      scoreDelta: 10,
      confidence: 0.9,
      reason: "Smoke run"
    });
    expect(attested.status).toBe(201);

    const attestations = await api.get("/reputation/attestations");
    expect(attestations.status).toBe(200);
    expect(attestations.body.attestations.length).toBe(1);

    const score = await api.get("/reputation/score/0.0.1001");
    expect(score.status).toBe(200);

    const leaderboard = await api.get("/reputation/leaderboard");
    expect(leaderboard.status).toBe(200);

    const trustGraph = await api.get("/reputation/trust-graph");
    expect(trustGraph.status).toBe(200);

    const pool = await api.post("/insurance/pools").send({
      managerAccountId: "0.0.1001",
      escrowAccountId: "0.0.5001",
      initialLiquidityHbar: 100
    });
    expect(pool.status).toBe(201);
    const poolId = pool.body.pool.id as string;

    const poolDeposit = await api.post(`/insurance/pools/${poolId}/deposit`).send({
      accountId: "0.0.1001",
      amountHbar: 20
    });
    expect(poolDeposit.status).toBe(200);

    const reserve = await api.post(`/insurance/pools/${poolId}/reserve`).send({
      amountHbar: 10
    });
    expect(reserve.status).toBe(200);

    const listPools = await api.get("/insurance/pools");
    expect(listPools.status).toBe(200);
    expect(listPools.body.pools.length).toBe(1);

    const policy = await api.post("/insurance/policies").send({
      marketId,
      underwriterAccountId: "0.0.1001",
      beneficiaryAccountId: "0.0.2001",
      coverageAmountHbar: 20,
      premiumRateBps: 500,
      expirationTime: "2026-12-31T00:00:00.000Z",
      escrowAccountId: "0.0.5001"
    });
    expect(policy.status).toBe(201);
    const policyId = policy.body.policy.id as string;

    const listPolicies = await api.get("/insurance/policies");
    expect(listPolicies.status).toBe(200);
    expect(listPolicies.body.policies.length).toBe(1);

    const policyClaim = await api.post(`/insurance/policies/${policyId}/claims`).send({
      claimantAccountId: "0.0.2001",
      triggerReason: "Smoke triggered"
    });
    expect(policyClaim.status).toBe(200);
  });

  it("supports authenticated smoke mode", async () => {
    server = createApiServer({ apiKey: "smoke-secret" });
    const api = request(server.app);

    const unauthorized = await api.get("/health");
    expect(unauthorized.status).toBe(401);

    const authorized = await api.get("/health").set("x-api-key", "smoke-secret");
    expect(authorized.status).toBe(200);
  });
});
