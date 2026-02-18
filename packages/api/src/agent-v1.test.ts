import { generateKeyPairSync, sign } from "node:crypto";

import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const walletAccountId = "0.0.7001";
  const walletPrivateKeyDer = "302e020100300506032b6570042204201111111111111111111111111111111111111111111111111111111111111111";

  return {
    walletAccountId,
    walletPrivateKeyDer,
    marketCalls: [] as Array<Record<string, unknown>>,
    betCalls: [] as Array<Record<string, unknown>>,
    transferCalls: [] as Array<Record<string, unknown>>,
    marketMap: new Map<string, Record<string, unknown>>()
  };
});

vi.mock("@simulacrum/core", () => ({
  EncryptedInMemoryKeyStore: class {
    constructor(_secret: string) {}
    save = vi.fn(async () => undefined);
    load = vi.fn(async () => null);
  },
  createAccount: vi.fn(async () => ({
    accountId: state.walletAccountId,
    privateKey: state.walletPrivateKeyDer
  })),
  createHederaClient: vi.fn(() => ({
    close: vi.fn(),
    ledgerId: { toString: () => "testnet" }
  })),
  getBalance: vi.fn(async () => ({
    accountId: state.walletAccountId,
    hbar: 1.2,
    tinybar: "120000000"
  })),
  transferHbar: vi.fn(async (from: string, to: string, amount: number) => {
    state.transferCalls.push({ from, to, amount });
    return {
      transactionId: "tx-faucet",
      transactionUrl: "https://hashscan.io/testnet/transaction/tx-faucet"
    };
  }),
  createPersistentStore: vi.fn((opts: { create: () => unknown }) => {
    let store = opts.create();
    return {
      get: (override?: unknown) => override ?? store,
      persist: vi.fn(),
      reset: () => { store = opts.create(); }
    };
  }),
  ValidationError: class extends Error { constructor(m: string) { super(m); this.name = "ValidationError"; } },
  clamp: (v: number, min: number, max: number) => Math.min(max, Math.max(min, v)),
  validateNonEmptyString: vi.fn((v: string, f: string) => { if (v.trim().length === 0) throw new Error(`${f} must be a non-empty string.`); }),
  validatePositiveNumber: vi.fn((v: number, f: string) => { if (!Number.isFinite(v) || v <= 0) throw new Error(`${f} must be a positive number.`); }),
  validatePositiveInteger: vi.fn((v: number, f: string) => { if (!Number.isInteger(v) || v <= 0) throw new Error(`${f} must be a positive integer.`); }),
  validateNonNegativeNumber: vi.fn((v: number, f: string) => { if (!Number.isFinite(v) || v < 0) throw new Error(`${f} must be a non-negative number.`); }),
  validateFiniteNumber: vi.fn((v: number, f: string) => { if (!Number.isFinite(v)) throw new Error(`${f} must be a finite number.`); }),
  validateNonNegativeInteger: vi.fn((v: number, f: string) => { if (!Number.isInteger(v) || v < 0) throw new Error(`${f} must be a non-negative integer.`); })
}));

vi.mock("@simulacrum/markets", () => ({
  getMarketStore: () => ({
    markets: state.marketMap,
    bets: new Map<string, Array<Record<string, unknown>>>(),
    claims: new Map(),
    claimIndex: new Set(),
    orders: new Map()
  }),
  createMarket: vi.fn(async (input: Record<string, unknown>) => {
    state.marketCalls.push(input);
    const market = {
      id: "0.0.8080",
      question: input.question,
      creatorAccountId: input.creatorAccountId,
      escrowAccountId: input.escrowAccountId,
      closeTime: input.closeTime,
      createdAt: "2026-02-18T00:00:00.000Z",
      status: "OPEN",
      outcomes: ["YES", "NO"],
      topicId: "0.0.8080",
      topicUrl: "https://hashscan.io/testnet/topic/0.0.8080",
      outcomeTokenIds: { YES: "0.0.1", NO: "0.0.2" },
      outcomeTokenUrls: {
        YES: "https://hashscan.io/testnet/token/0.0.1",
        NO: "https://hashscan.io/testnet/token/0.0.2"
      }
    };
    state.marketMap.set("0.0.8080", market);
    return {
      market,
      topicTransactionId: "tx-market",
      topicTransactionUrl: "https://hashscan.io/testnet/transaction/tx-market"
    };
  }),
  placeBet: vi.fn(async (input: Record<string, unknown>) => {
    state.betCalls.push(input);
    return {
      id: "bet-1",
      marketId: input.marketId,
      bettorAccountId: input.bettorAccountId,
      outcome: input.outcome,
      amountHbar: input.amountHbar,
      placedAt: "2026-02-18T00:01:00.000Z"
    };
  }),
  publishOrder: vi.fn(async () => ({ id: "order-1" })),
  resolveMarket: vi.fn(async () => ({ marketId: "0.0.8080", resolvedOutcome: "YES", resolvedByAccountId: state.walletAccountId })),
  selfAttestMarket: vi.fn(async () => ({ marketId: "0.0.8080", selfAttestation: {}, challengeWindowEndsAt: "2026-02-18T00:10:00.000Z" })),
  challengeMarketResolution: vi.fn(async () => ({ challenge: { id: "challenge-1" } })),
  submitOracleVote: vi.fn(async () => ({ vote: { id: "vote-1", outcome: "YES", confidence: 0.8 } })),
  claimWinnings: vi.fn(async () => ({ id: "claim-1", marketId: "0.0.8080", accountId: state.walletAccountId, payoutHbar: 3 })),
  getOrderBook: vi.fn(async (marketId: string) => ({ marketId, orders: [], bids: [], asks: [] }))
}));

vi.mock("@simulacrum/reputation", () => ({
  submitAttestation: vi.fn(async () => ({
    id: "att-1",
    subjectAccountId: state.walletAccountId,
    attesterAccountId: "0.0.9999",
    scoreDelta: 1,
    confidence: 0.8,
    reason: "ok",
    tags: [],
    createdAt: "2026-02-18T00:00:00.000Z",
    topicId: "0.0.9191",
    topicUrl: "https://hashscan.io/testnet/topic/0.0.9191"
  }))
}));

import { createApiServer } from "./server.js";
import { resetAgentPlatformStoreForTests } from "./agent-platform/store.js";

function toSignatureBase64(message: string, privateKeyPem: string): string {
  return sign(null, Buffer.from(message, "utf8"), privateKeyPem).toString("base64");
}

describe("agent-v1 interface", () => {
  const servers: Array<ReturnType<typeof createApiServer>> = [];

  beforeEach(() => {
    resetAgentPlatformStoreForTests();
    state.marketCalls.length = 0;
    state.betCalls.length = 0;
    state.transferCalls.length = 0;
    state.marketMap.clear();
    process.env.HEDERA_NETWORK = "testnet";
    process.env.HEDERA_ACCOUNT_ID = "0.0.5005";
    process.env.HEDERA_PRIVATE_KEY =
      "302e020100300506032b657004220420aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    process.env.HEDERA_PRIVATE_KEY_TYPE = "der";
  });

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop();

      if (server) {
        await server.stop().catch(() => {
          // ignore
        });
      }
    }
  });

  it("registers, verifies signed challenge, and binds market/bet identity to wallet", async () => {
    const server = createApiServer({
      agentPlatform: {
        enabled: true,
        agentOnlyMode: false,
        legacyRoutesEnabled: false,
        selfRegistrationEnabled: true,
        walletStoreSecret: "wallet-secret",
        jwtSecret: "jwt-secret"
      }
    });
    servers.push(server);
    const api = request(server.app);

    const keypair = generateKeyPairSync("ed25519");
    const publicKeyDerBase64 = keypair.publicKey.export({ type: "spki", format: "der" }).toString("base64");
    const privateKeyPem = keypair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();

    const register = await api.post("/agent/v1/auth/register").send({
      name: "agent-a",
      authPublicKey: publicKeyDerBase64
    });
    expect(register.status).toBe(201);
    expect(register.body.agent.walletAccountId).toBe(state.walletAccountId);

    const challenge = await api.post("/agent/v1/auth/challenge").send({
      agentId: register.body.agent.id
    });
    expect(challenge.status).toBe(201);

    const verifyResponse = await api.post("/agent/v1/auth/verify").send({
      agentId: register.body.agent.id,
      challengeId: challenge.body.challengeId,
      signature: toSignatureBase64(challenge.body.message, privateKeyPem)
    });
    expect(verifyResponse.status).toBe(200);
    expect(typeof verifyResponse.body.token).toBe("string");

    const token = verifyResponse.body.token as string;

    const create = await api
      .post("/agent/v1/markets")
      .set("authorization", `Bearer ${token}`)
      .send({
        question: "Will wallet binding be enforced?",
        closeTime: new Date(Date.now() + 60_000).toISOString(),
        creatorAccountId: "0.0.9999"
      });
    expect(create.status).toBe(201);
    expect(state.marketCalls[0]?.creatorAccountId).toBe(state.walletAccountId);
    expect(state.marketCalls[0]?.escrowAccountId).toBe(state.walletAccountId);

    const bet = await api
      .post("/agent/v1/markets/0.0.8080/bets")
      .set("authorization", `Bearer ${token}`)
      .send({
        outcome: "YES",
        amountHbar: 2,
        bettorAccountId: "0.0.9999"
      });
    expect(bet.status).toBe(201);
    expect(state.betCalls[0]?.bettorAccountId).toBe(state.walletAccountId);
  });

  it("rejects unauthenticated access and challenge replay", async () => {
    const server = createApiServer({
      agentPlatform: {
        enabled: true,
        agentOnlyMode: false,
        legacyRoutesEnabled: false,
        walletStoreSecret: "wallet-secret",
        jwtSecret: "jwt-secret"
      }
    });
    servers.push(server);
    const api = request(server.app);

    const keypair = generateKeyPairSync("ed25519");
    const publicKeyDerBase64 = keypair.publicKey.export({ type: "spki", format: "der" }).toString("base64");
    const privateKeyPem = keypair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();

    const register = await api.post("/agent/v1/auth/register").send({
      name: "agent-b",
      authPublicKey: publicKeyDerBase64
    });
    const challenge = await api.post("/agent/v1/auth/challenge").send({
      agentId: register.body.agent.id
    });
    const signature = toSignatureBase64(challenge.body.message, privateKeyPem);

    const firstVerify = await api.post("/agent/v1/auth/verify").send({
      agentId: register.body.agent.id,
      challengeId: challenge.body.challengeId,
      signature
    });
    expect(firstVerify.status).toBe(200);

    const replayVerify = await api.post("/agent/v1/auth/verify").send({
      agentId: register.body.agent.id,
      challengeId: challenge.body.challengeId,
      signature
    });
    expect(replayVerify.status).toBe(401);

    const markets = await api.get("/agent/v1/markets");
    expect(markets.status).toBe(401);
  });

  it("runs manual faucet request with cooldown/cap checks", async () => {
    const server = createApiServer({
      agentPlatform: {
        enabled: true,
        agentOnlyMode: false,
        legacyRoutesEnabled: false,
        walletStoreSecret: "wallet-secret",
        jwtSecret: "jwt-secret",
        refillThresholdHbar: 5,
        refillTargetHbar: 10,
        refillCooldownSeconds: 0
      }
    });
    servers.push(server);
    const api = request(server.app);

    const keypair = generateKeyPairSync("ed25519");
    const publicKeyDerBase64 = keypair.publicKey.export({ type: "spki", format: "der" }).toString("base64");
    const privateKeyPem = keypair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();

    const register = await api.post("/agent/v1/auth/register").send({
      name: "agent-c",
      authPublicKey: publicKeyDerBase64
    });
    const challenge = await api.post("/agent/v1/auth/challenge").send({
      agentId: register.body.agent.id
    });
    const verifyResponse = await api.post("/agent/v1/auth/verify").send({
      agentId: register.body.agent.id,
      challengeId: challenge.body.challengeId,
      signature: toSignatureBase64(challenge.body.message, privateKeyPem)
    });

    const refill = await api
      .post("/agent/v1/wallet/faucet/request")
      .set("authorization", `Bearer ${verifyResponse.body.token}`)
      .send({});

    expect(refill.status).toBe(201);
    expect(refill.body.funded).toBe(true);
    expect(state.transferCalls.length).toBeGreaterThan(0);
  });
});
