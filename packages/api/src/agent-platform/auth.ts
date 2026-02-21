import { createHmac, createPublicKey, randomBytes, randomUUID, timingSafeEqual, verify } from "node:crypto";

import { createHederaClient, type HederaNetwork } from "@simulacrum/core";

import {
  getAgentPlatformStore,
  persistAgentPlatformStore
} from "./store.js";
import { EncryptedAgentWalletStore } from "./wallet-store.js";
import type {
  AgentChallengeRecord,
  AgentJwtClaims,
  AgentPlatformOptions,
  AgentPlatformStore,
  AgentProfileRecord,
  AgentWalletCredentials
} from "./types.js";

type HederaClient = ReturnType<typeof createHederaClient>;

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

const DEFAULT_JWT_TTL_SECONDS = 60 * 60;
const DEFAULT_CHALLENGE_TTL_SECONDS = 5 * 60;

export interface RegisterAgentInput {
  id?: string;
  name: string;
  authPublicKey: string;
  wallet: AgentWalletCredentials;
}

export interface AgentChallenge {
  challengeId: string;
  agentId: string;
  nonce: string;
  message: string;
  expiresAt: string;
}

export interface VerifyChallengeInput {
  agentId: string;
  challengeId: string;
  signature: string;
}

export interface VerifyChallengeResult {
  token: string;
  expiresAt: string;
  agentId: string;
  walletAccountId: string;
}

export interface AgentAuthServiceOptions
  extends Pick<AgentPlatformOptions, "jwtSecret" | "jwtTtlSeconds" | "challengeTtlSeconds" | "walletStoreSecret"> {
  store?: AgentPlatformStore;
  now?: () => Date;
  network?: HederaNetwork;
}

export class AgentAuthError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "AgentAuthError";
  }
}

function validateNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new AgentAuthError(`${field} must be a non-empty string.`);
  }
}

function normalizeNetwork(value: string | undefined): HederaNetwork {
  const normalized = (value ?? "testnet").toLowerCase();

  if (normalized === "testnet" || normalized === "mainnet" || normalized === "previewnet") {
    return normalized;
  }

  return "testnet";
}

function toBase64Url(value: Buffer | string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64");
}

function decodeFlexibleBinary(value: string, fieldName: string): Buffer {
  const trimmed = value.trim();

  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    return Buffer.from(trimmed, "hex");
  }

  const fromBase64 = fromBase64Url(trimmed);

  if (fromBase64.length === 0) {
    throw new AgentAuthError(`${fieldName} is not a valid hex/base64 payload.`);
  }

  return fromBase64;
}

function parseEd25519PublicKey(publicKey: string): ReturnType<typeof createPublicKey> {
  const trimmed = publicKey.trim();

  if (trimmed.startsWith("-----BEGIN")) {
    return createPublicKey(trimmed);
  }

  const decoded = decodeFlexibleBinary(trimmed, "authPublicKey");

  if (decoded.length === 32) {
    return createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, decoded]),
      format: "der",
      type: "spki"
    });
  }

  return createPublicKey({
    key: decoded,
    format: "der",
    type: "spki"
  });
}

function safeJsonParse(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export class AgentAuthService {
  readonly #store: AgentPlatformStore;
  readonly #walletStore: EncryptedAgentWalletStore;
  readonly #jwtSecret: string;
  readonly #jwtTtlSeconds: number;
  readonly #challengeTtlSeconds: number;
  readonly #now: () => Date;
  readonly #network: HederaNetwork;
  readonly #clientCache = new Map<string, HederaClient>();

  constructor(options: AgentAuthServiceOptions = {}) {
    this.#store = getAgentPlatformStore(options.store);

    const walletSecret =
      options.walletStoreSecret ??
      process.env.AGENT_WALLET_STORE_SECRET ??
      process.env.HEDERA_KEYSTORE_SECRET;
    if (!walletSecret) {
      throw new AgentAuthError(
        "Missing wallet store secret. Set AGENT_WALLET_STORE_SECRET or HEDERA_KEYSTORE_SECRET."
      );
    }
    this.#walletStore = new EncryptedAgentWalletStore(walletSecret);

    const jwtSecret =
      options.jwtSecret ??
      process.env.AGENT_JWT_SECRET ??
      process.env.SIMULACRUM_API_KEY;
    if (!jwtSecret) {
      throw new AgentAuthError(
        "Missing JWT secret. Set AGENT_JWT_SECRET or SIMULACRUM_API_KEY."
      );
    }
    this.#jwtSecret = jwtSecret;
    const envJwtTtl = Number(process.env.AGENT_JWT_TTL_SECONDS);
    const resolvedJwtTtl =
      options.jwtTtlSeconds ?? (Number.isFinite(envJwtTtl) ? envJwtTtl : DEFAULT_JWT_TTL_SECONDS);
    this.#jwtTtlSeconds = Math.max(
      60,
      Math.round(resolvedJwtTtl)
    );
    const envChallengeTtl = Number(process.env.AGENT_CHALLENGE_TTL_SECONDS);
    const resolvedChallengeTtl =
      options.challengeTtlSeconds ??
      (Number.isFinite(envChallengeTtl) ? envChallengeTtl : DEFAULT_CHALLENGE_TTL_SECONDS);
    this.#challengeTtlSeconds = Math.max(
      30,
      Math.round(resolvedChallengeTtl)
    );
    this.#now = options.now ?? (() => new Date());
    this.#network = options.network ?? normalizeNetwork(process.env.HEDERA_NETWORK);
  }

  listAgents(): AgentProfileRecord[] {
    return Object.values(this.#store.agents);
  }

  getAgent(agentId: string): AgentProfileRecord | null {
    return this.#store.agents[agentId] ?? null;
  }

  registerAgent(input: RegisterAgentInput): AgentProfileRecord {
    validateNonEmpty(input.name, "name");
    validateNonEmpty(input.authPublicKey, "authPublicKey");
    validateNonEmpty(input.wallet.accountId, "wallet.accountId");
    validateNonEmpty(input.wallet.privateKey, "wallet.privateKey");
    parseEd25519PublicKey(input.authPublicKey);

    const id = input.id?.trim() || randomUUID();

    if (this.#store.agents[id]) {
      throw new AgentAuthError(`Agent ${id} is already registered.`);
    }

    const duplicateName = Object.values(this.#store.agents).some(
      (candidate) => candidate.name.toLowerCase() === input.name.trim().toLowerCase()
    );

    if (duplicateName) {
      throw new AgentAuthError(`Agent name "${input.name}" is already taken.`);
    }

    const duplicateWallet = Object.values(this.#store.agents).some(
      (candidate) => candidate.walletAccountId === input.wallet.accountId
    );

    if (duplicateWallet) {
      throw new AgentAuthError(`Wallet account ${input.wallet.accountId} is already in use.`);
    }

    const now = this.#now().toISOString();
    const record: AgentProfileRecord = {
      id,
      name: input.name.trim(),
      authPublicKey: input.authPublicKey.trim(),
      walletAccountId: input.wallet.accountId,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now
    };

    this.#store.agents[record.id] = record;
    this.#store.wallets[record.id] = this.#walletStore.toStoredRecord(input.wallet);
    persistAgentPlatformStore(this.#store);

    return record;
  }

  createChallenge(agentId: string): AgentChallenge {
    validateNonEmpty(agentId, "agentId");

    const record = this.#store.agents[agentId];

    if (!record) {
      throw new AgentAuthError(`Agent ${agentId} was not found.`);
    }

    this.cleanupExpiredChallenges();

    const now = this.#now();
    const challenge: AgentChallengeRecord = {
      id: randomUUID(),
      agentId,
      nonce: randomBytes(16).toString("hex"),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.#challengeTtlSeconds * 1000).toISOString()
    };

    this.#store.challenges[challenge.id] = challenge;
    persistAgentPlatformStore(this.#store);

    return {
      challengeId: challenge.id,
      agentId: challenge.agentId,
      nonce: challenge.nonce,
      message: this.buildChallengeMessage(challenge),
      expiresAt: challenge.expiresAt
    };
  }

  verifyChallenge(input: VerifyChallengeInput): VerifyChallengeResult {
    validateNonEmpty(input.agentId, "agentId");
    validateNonEmpty(input.challengeId, "challengeId");
    validateNonEmpty(input.signature, "signature");

    this.cleanupExpiredChallenges();

    const challenge = this.#store.challenges[input.challengeId];

    if (!challenge || challenge.agentId !== input.agentId) {
      throw new AgentAuthError("Challenge was not found for this agent.");
    }

    if (challenge.usedAt) {
      throw new AgentAuthError("Challenge has already been used.");
    }

    if (Date.parse(challenge.expiresAt) < this.#now().getTime()) {
      throw new AgentAuthError("Challenge has expired.");
    }

    const agent = this.#store.agents[input.agentId];

    if (!agent) {
      throw new AgentAuthError(`Agent ${input.agentId} was not found.`);
    }

    if (agent.status !== "ACTIVE") {
      throw new AgentAuthError(`Agent ${input.agentId} is not active.`);
    }

    const signature = decodeFlexibleBinary(input.signature, "signature");
    const verified = verify(
      null,
      Buffer.from(this.buildChallengeMessage(challenge), "utf8"),
      parseEd25519PublicKey(agent.authPublicKey),
      signature
    );

    if (!verified) {
      throw new AgentAuthError("Challenge signature is invalid.");
    }

    const now = this.#now();
    challenge.usedAt = now.toISOString();
    agent.lastLoginAt = now.toISOString();
    agent.updatedAt = now.toISOString();
    persistAgentPlatformStore(this.#store);

    const claims = this.createClaims(agent.id, agent.walletAccountId, now);
    const token = this.signJwt(claims);

    return {
      token,
      agentId: claims.sub,
      walletAccountId: claims.walletAccountId,
      expiresAt: new Date(claims.exp * 1000).toISOString()
    };
  }

  verifyAccessToken(token: string): AgentJwtClaims {
    validateNonEmpty(token, "token");

    const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");

    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw new AgentAuthError("Access token format is invalid.");
    }

    const expectedSignature = toBase64Url(
      createHmac("sha256", this.#jwtSecret).update(`${encodedHeader}.${encodedPayload}`).digest()
    );

    if (
      expectedSignature.length !== encodedSignature.length ||
      !timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(encodedSignature))
    ) {
      throw new AgentAuthError("Access token signature is invalid.");
    }

    const payload = safeJsonParse(fromBase64Url(encodedPayload).toString("utf8"));

    if (!payload || typeof payload !== "object") {
      throw new AgentAuthError("Access token payload is invalid.");
    }

    const claims = payload as Partial<AgentJwtClaims>;

    if (
      typeof claims.sub !== "string" ||
      typeof claims.walletAccountId !== "string" ||
      claims.scope !== "agent" ||
      typeof claims.jti !== "string" ||
      typeof claims.iat !== "number" ||
      typeof claims.exp !== "number"
    ) {
      throw new AgentAuthError("Access token claims are invalid.");
    }

    if (claims.exp <= Math.floor(this.#now().getTime() / 1000)) {
      throw new AgentAuthError("Access token has expired.");
    }

    const agent = this.#store.agents[claims.sub];

    if (!agent || agent.status !== "ACTIVE") {
      throw new AgentAuthError("Agent does not exist or is not active.");
    }

    if (agent.walletAccountId !== claims.walletAccountId) {
      throw new AgentAuthError("Access token wallet binding is invalid.");
    }

    return claims as AgentJwtClaims;
  }

  refreshToken(currentToken: string): VerifyChallengeResult {
    const claims = this.verifyAccessToken(currentToken);
    const now = this.#now();
    const remainingSeconds = claims.exp - Math.floor(now.getTime() / 1000);
    if (remainingSeconds > Math.floor(this.#jwtTtlSeconds / 2)) {
      throw new AgentAuthError("Token is not yet eligible for refresh.");
    }
    const newClaims = this.createClaims(claims.sub, claims.walletAccountId, now);
    const token = this.signJwt(newClaims);
    return {
      token,
      agentId: newClaims.sub,
      walletAccountId: newClaims.walletAccountId,
      expiresAt: new Date(newClaims.exp * 1000).toISOString()
    };
  }

  getWallet(agentId: string): AgentWalletCredentials {
    const wallet = this.#store.wallets[agentId];

    if (!wallet) {
      throw new AgentAuthError(`Wallet for agent ${agentId} was not found.`);
    }

    return this.#walletStore.fromStoredRecord(wallet);
  }

  getClientForAgent(agentId: string): HederaClient {
    const wallet = this.getWallet(agentId);
    const cacheKey = `${wallet.accountId}:${wallet.privateKeyType}:${wallet.privateKey}`;
    const cached = this.#clientCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const MAX_CLIENT_CACHE_SIZE = 100;
    if (this.#clientCache.size >= MAX_CLIENT_CACHE_SIZE) {
      const oldest = this.#clientCache.keys().next().value;
      if (oldest !== undefined) {
        this.#clientCache.get(oldest)?.close();
        this.#clientCache.delete(oldest);
      }
    }

    const client = createHederaClient({
      network: this.#network,
      accountId: wallet.accountId,
      privateKey: wallet.privateKey,
      privateKeyType: wallet.privateKeyType
    });
    this.#clientCache.set(cacheKey, client);

    return client;
  }

  cleanupExpiredChallenges(): void {
    const nowMs = this.#now().getTime();
    let mutated = false;

    for (const [id, challenge] of Object.entries(this.#store.challenges)) {
      if (Date.parse(challenge.expiresAt) < nowMs || challenge.usedAt) {
        delete this.#store.challenges[id];
        mutated = true;
      }
    }

    if (mutated) {
      persistAgentPlatformStore(this.#store);
    }
  }

  buildChallengeMessage(challenge: Pick<AgentChallengeRecord, "id" | "nonce" | "agentId" | "expiresAt">): string {
    return [
      "SIMULACRUM_AGENT_LOGIN",
      `challengeId:${challenge.id}`,
      `nonce:${challenge.nonce}`,
      `agentId:${challenge.agentId}`,
      `expiresAt:${challenge.expiresAt}`
    ].join("\n");
  }

  close(): void {
    for (const client of this.#clientCache.values()) {
      client.close();
    }

    this.#clientCache.clear();
  }

  createClaims(agentId: string, walletAccountId: string, now: Date): AgentJwtClaims {
    const nowSeconds = Math.floor(now.getTime() / 1000);

    return {
      sub: agentId,
      walletAccountId,
      scope: "agent",
      jti: randomUUID(),
      iat: nowSeconds,
      exp: nowSeconds + this.#jwtTtlSeconds
    };
  }

  signJwt(claims: AgentJwtClaims): string {
    const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = toBase64Url(JSON.stringify(claims));
    const signature = toBase64Url(
      createHmac("sha256", this.#jwtSecret).update(`${header}.${payload}`).digest()
    );

    return `${header}.${payload}.${signature}`;
  }
}

export function createAgentAuthService(options: AgentAuthServiceOptions = {}): AgentAuthService {
  return new AgentAuthService(options);
}
