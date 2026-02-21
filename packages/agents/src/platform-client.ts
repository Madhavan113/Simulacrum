import { createPrivateKey, sign } from "node:crypto";

type FetchLike = typeof fetch;

const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

function toBase64(value: Buffer): string {
  return value.toString("base64");
}

function decodeFlexibleBinary(value: string): Buffer {
  const trimmed = value.trim();

  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    return Buffer.from(trimmed, "hex");
  }

  const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64");
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function privateKeyForSigning(input: string) {
  const trimmed = input.trim();

  if (trimmed.startsWith("-----BEGIN")) {
    return createPrivateKey(trimmed);
  }

  const decoded = decodeFlexibleBinary(trimmed);

  if (decoded.length === 32) {
    return createPrivateKey({
      key: Buffer.concat([ED25519_PKCS8_PREFIX, decoded]),
      format: "der",
      type: "pkcs8"
    });
  }

  return createPrivateKey({
    key: decoded,
    format: "der",
    type: "pkcs8"
  });
}

async function requestJson<T>(
  fetchImpl: FetchLike,
  url: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers
    }
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with status ${response.status}.`);
  }

  return payload as T;
}

export interface PlatformClientOptions {
  baseUrl: string;
  fetchImpl?: FetchLike;
}

export interface RegisterAgentInput {
  name: string;
  authPublicKey: string;
  agentId?: string;
}

export interface RegisterAgentResponse {
  agent: {
    id: string;
    name: string;
    walletAccountId: string;
    status: string;
    createdAt: string;
  };
  wallet: {
    accountId: string;
    initialFundingHbar: number;
  };
}

export interface ChallengeResponse {
  challengeId: string;
  agentId: string;
  nonce: string;
  message: string;
  expiresAt: string;
}

export interface VerifyChallengeInput {
  agentId: string;
  challengeId: string;
  challengeMessage: string;
  authPrivateKey: string;
}

export interface VerifyChallengeResponse {
  tokenType: "Bearer";
  token: string;
  agentId: string;
  walletAccountId: string;
  expiresAt: string;
}

export interface Market {
  id: string;
  question: string;
  description?: string;
  creatorAccountId: string;
  closeTime: string;
  createdAt: string;
  status: "OPEN" | "CLOSED" | "RESOLVED" | "DISPUTED";
  outcomes: string[];
  liquidityModel?: "CLOB" | "WEIGHTED_CURVE" | "HIGH_LIQUIDITY" | "LOW_LIQUIDITY";
  initialOddsByOutcome?: Record<string, number>;
  currentOddsByOutcome?: Record<string, number>;
}

export interface CreateMarketInput {
  question: string;
  description?: string;
  closeTime: string;
  outcomes?: string[];
  initialOddsByOutcome?: Record<string, number>;
  lowLiquidity?: boolean;
  liquidityModel?: "CLOB" | "WEIGHTED_CURVE" | "HIGH_LIQUIDITY" | "LOW_LIQUIDITY";
  curveLiquidityHbar?: number;
}

export interface PlaceBetInput {
  marketId: string;
  outcome: string;
  amountHbar: number;
}

export interface PlaceOrderInput {
  marketId: string;
  outcome: string;
  side: "BID" | "ASK";
  quantity: number;
  price: number;
}

export interface ResolveMarketInput {
  marketId: string;
  resolvedOutcome: string;
  reason?: string;
}

export interface SelfAttestInput {
  marketId: string;
  proposedOutcome: string;
  reason?: string;
  evidence?: string;
  challengeWindowMinutes?: number;
}

export interface ChallengeResolutionInput {
  marketId: string;
  proposedOutcome: string;
  reason: string;
  evidence?: string;
}

export interface OracleVoteInput {
  marketId: string;
  outcome: string;
  confidence?: number;
  reason?: string;
  reputationScore?: number;
}

export interface ClaimWinningsInput {
  marketId: string;
  payoutAccountId?: string;
}

export interface WalletBalance {
  accountId: string;
  hbar: number;
  tinybar: string;
}

export interface AgentProfile {
  agent: {
    id: string;
    name: string;
    walletAccountId: string;
    status: string;
    createdAt: string;
    updatedAt?: string;
    lastLoginAt?: string;
  };
  wallet: WalletBalance;
}

export interface MarketBetsSnapshot {
  marketId: string;
  betCount: number;
  totalStakedHbar: number;
  stakeByOutcome: Record<string, number>;
  bets: Array<{
    id: string;
    marketId: string;
    bettorAccountId: string;
    outcome: string;
    amountHbar: number;
    curveSharesPurchased?: number;
    transactionId: string;
    transactionUrl: string;
    timestamp: string;
  }>;
}

export interface OrderBookSnapshot {
  marketId: string;
  bids: Array<{ id: string; outcome: string; price: number; quantity: number; filledQuantity: number; accountId: string }>;
  asks: Array<{ id: string; outcome: string; price: number; quantity: number; filledQuantity: number; accountId: string }>;
}

export class PlatformClient {
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  #token: string | null = null;

  constructor(options: PlatformClientOptions) {
    this.#baseUrl = normalizeBaseUrl(options.baseUrl);
    this.#fetch = options.fetchImpl ?? fetch;
  }

  setAccessToken(token: string): void {
    this.#token = token.trim();
  }

  clearAccessToken(): void {
    this.#token = null;
  }

  async registerAgent(input: RegisterAgentInput): Promise<RegisterAgentResponse> {
    return requestJson<RegisterAgentResponse>(
      this.#fetch,
      `${this.#baseUrl}/agent/v1/auth/register`,
      {
        method: "POST",
        body: JSON.stringify(input)
      }
    );
  }

  async requestChallenge(agentId: string): Promise<ChallengeResponse> {
    return requestJson<ChallengeResponse>(
      this.#fetch,
      `${this.#baseUrl}/agent/v1/auth/challenge`,
      {
        method: "POST",
        body: JSON.stringify({ agentId })
      }
    );
  }

  async verifyChallengeAndLogin(input: VerifyChallengeInput): Promise<VerifyChallengeResponse> {
    const signature = sign(null, Buffer.from(input.challengeMessage, "utf8"), privateKeyForSigning(input.authPrivateKey));
    const response = await requestJson<VerifyChallengeResponse>(
      this.#fetch,
      `${this.#baseUrl}/agent/v1/auth/verify`,
      {
        method: "POST",
        body: JSON.stringify({
          agentId: input.agentId,
          challengeId: input.challengeId,
          signature: toBase64(signature)
        })
      }
    );

    this.setAccessToken(response.token);
    return response;
  }

  async listMarkets(): Promise<Market[]> {
    const payload = await this.authorizedRequest<{ markets: Market[] }>(
      "/agent/v1/markets",
      { method: "GET" }
    );

    return payload.markets;
  }

  async createMarket(input: CreateMarketInput): Promise<{ market: Market }> {
    return this.authorizedRequest<{ market: Market }>("/agent/v1/markets", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  async placeBet(input: PlaceBetInput): Promise<{ bet: { id: string } }> {
    return this.authorizedRequest<{ bet: { id: string } }>(`/agent/v1/markets/${input.marketId}/bets`, {
      method: "POST",
      body: JSON.stringify({
        outcome: input.outcome,
        amountHbar: input.amountHbar
      })
    });
  }

  async placeOrder(input: PlaceOrderInput): Promise<{ order: { id: string } }> {
    return this.authorizedRequest<{ order: { id: string } }>(`/agent/v1/markets/${input.marketId}/orders`, {
      method: "POST",
      body: JSON.stringify({
        outcome: input.outcome,
        side: input.side,
        quantity: input.quantity,
        price: input.price
      })
    });
  }

  async resolveMarket(input: ResolveMarketInput): Promise<{ resolution: { marketId: string } }> {
    return this.authorizedRequest<{ resolution: { marketId: string } }>(
      `/agent/v1/markets/${input.marketId}/resolve`,
      {
        method: "POST",
        body: JSON.stringify({
          resolvedOutcome: input.resolvedOutcome,
          reason: input.reason
        })
      }
    );
  }

  async claimWinnings(input: ClaimWinningsInput): Promise<{ claim: { id: string } }> {
    return this.authorizedRequest<{ claim: { id: string } }>(`/agent/v1/markets/${input.marketId}/claims`, {
      method: "POST",
      body: JSON.stringify({
        payoutAccountId: input.payoutAccountId
      })
    });
  }

  async getMe(): Promise<AgentProfile> {
    return this.authorizedRequest<AgentProfile>("/agent/v1/me", {
      method: "GET"
    });
  }

  async getMarket(marketId: string): Promise<{ market: Market }> {
    return this.authorizedRequest<{ market: Market }>(`/agent/v1/markets/${marketId}`, {
      method: "GET"
    });
  }

  async getMarketBets(marketId: string): Promise<MarketBetsSnapshot> {
    return this.authorizedRequest<MarketBetsSnapshot>(`/agent/v1/markets/${marketId}/bets`, {
      method: "GET"
    });
  }

  async getOrderBook(marketId: string, options?: { mirror?: boolean }): Promise<OrderBookSnapshot> {
    const qs = options?.mirror ? "?mirror=true" : "";
    return this.authorizedRequest<OrderBookSnapshot>(`/agent/v1/markets/${marketId}/orderbook${qs}`, {
      method: "GET"
    });
  }

  async selfAttest(input: SelfAttestInput): Promise<unknown> {
    return this.authorizedRequest(`/agent/v1/markets/${input.marketId}/self-attest`, {
      method: "POST",
      body: JSON.stringify({
        proposedOutcome: input.proposedOutcome,
        reason: input.reason,
        evidence: input.evidence,
        challengeWindowMinutes: input.challengeWindowMinutes
      })
    });
  }

  async challengeResolution(input: ChallengeResolutionInput): Promise<unknown> {
    return this.authorizedRequest(`/agent/v1/markets/${input.marketId}/challenge`, {
      method: "POST",
      body: JSON.stringify({
        proposedOutcome: input.proposedOutcome,
        reason: input.reason,
        evidence: input.evidence
      })
    });
  }

  async oracleVote(input: OracleVoteInput): Promise<unknown> {
    return this.authorizedRequest(`/agent/v1/markets/${input.marketId}/oracle-vote`, {
      method: "POST",
      body: JSON.stringify({
        outcome: input.outcome,
        confidence: input.confidence,
        reason: input.reason,
        reputationScore: input.reputationScore
      })
    });
  }

  async getWalletBalance(): Promise<WalletBalance> {
    return this.authorizedRequest<WalletBalance>("/agent/v1/wallet/balance", {
      method: "GET"
    });
  }

  wsUrl(): string {
    const base = this.#baseUrl.replace(/^http/, "ws");
    const tokenParam = this.#token ? `?token=${this.#token}` : "";
    return `${base}/ws${tokenParam}`;
  }

  private async authorizedRequest<T>(path: string, init: RequestInit): Promise<T> {
    if (!this.#token) {
      throw new Error("Access token is missing. Call verifyChallengeAndLogin first.");
    }

    return requestJson<T>(this.#fetch, `${this.#baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        authorization: `Bearer ${this.#token}`
      }
    });
  }
}

export function createPlatformClient(options: PlatformClientOptions): PlatformClient {
  return new PlatformClient(options);
}
