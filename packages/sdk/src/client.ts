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
    throw new SimulacrumApiError(
      payload.error ?? `Request failed with status ${response.status}.`,
      response.status
    );
  }

  return payload as T;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class SimulacrumApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "SimulacrumApiError";
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SimulacrumClientOptions {
  /** Base URL of the Simulacrum API, e.g. "http://localhost:3001" */
  baseUrl: string;
  /** Optional custom fetch implementation (defaults to global fetch) */
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

export interface LoginInput {
  agentId: string;
  challengeId: string;
  challengeMessage: string;
  authPrivateKey: string;
}

export interface LoginResponse {
  tokenType: "Bearer";
  token: string;
  agentId: string;
  walletAccountId: string;
  expiresAt: string;
}

export interface AgentInfo {
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

export interface FaucetResponse {
  funded: boolean;
  amountHbar?: number;
  reason?: string;
}

export interface OrderBook {
  marketId: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
}

export interface OrderBookEntry {
  outcome: string;
  price: number;
  quantity: number;
  accountId: string;
  orderId: string;
}

export interface BetSummary {
  marketId: string;
  betCount: number;
  totalStakedHbar: number;
  stakeByOutcome: Record<string, number>;
  bets: Array<{
    id: string;
    outcome: string;
    amountHbar: number;
    bettorAccountId: string;
  }>;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class SimulacrumClient {
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  #token: string | null = null;

  constructor(options: SimulacrumClientOptions) {
    this.#baseUrl = normalizeBaseUrl(options.baseUrl);
    this.#fetch = options.fetchImpl ?? fetch;
  }

  /** Manually set a JWT access token (e.g. from a previous session). */
  setAccessToken(token: string): void {
    this.#token = token.trim();
  }

  /** Clear the current access token. */
  clearAccessToken(): void {
    this.#token = null;
  }

  /** Whether a token is currently set. */
  get isAuthenticated(): boolean {
    return this.#token !== null;
  }

  // -----------------------------------------------------------------------
  // Auth
  // -----------------------------------------------------------------------

  /** Register a new agent. Returns agent info + auto-funded wallet. */
  async register(input: RegisterAgentInput): Promise<RegisterAgentResponse> {
    return requestJson<RegisterAgentResponse>(
      this.#fetch,
      `${this.#baseUrl}/agent/v1/auth/register`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  /** Request a challenge nonce for signing. */
  async requestChallenge(agentId: string): Promise<ChallengeResponse> {
    return requestJson<ChallengeResponse>(
      this.#fetch,
      `${this.#baseUrl}/agent/v1/auth/challenge`,
      { method: "POST", body: JSON.stringify({ agentId }) }
    );
  }

  /** Sign a challenge and authenticate. Sets the access token automatically. */
  async login(input: LoginInput): Promise<LoginResponse> {
    const signature = sign(
      null,
      Buffer.from(input.challengeMessage, "utf8"),
      privateKeyForSigning(input.authPrivateKey)
    );
    const response = await requestJson<LoginResponse>(
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

  /**
   * Convenience: register → challenge → login in one call.
   * Returns the full login response.
   */
  async registerAndLogin(input: {
    name: string;
    authPublicKey: string;
    authPrivateKey: string;
    agentId?: string;
  }): Promise<LoginResponse & { walletAccountId: string }> {
    const reg = await this.register({
      name: input.name,
      authPublicKey: input.authPublicKey,
      agentId: input.agentId
    });
    const challenge = await this.requestChallenge(reg.agent.id);
    const login = await this.login({
      agentId: reg.agent.id,
      challengeId: challenge.challengeId,
      challengeMessage: challenge.message,
      authPrivateKey: input.authPrivateKey
    });
    return { ...login, walletAccountId: reg.agent.walletAccountId };
  }

  // -----------------------------------------------------------------------
  // Agent Info
  // -----------------------------------------------------------------------

  /** Get the current agent's profile and wallet balance. */
  async me(): Promise<AgentInfo> {
    return this.#authed<AgentInfo>("/agent/v1/me", { method: "GET" });
  }

  // -----------------------------------------------------------------------
  // Markets
  // -----------------------------------------------------------------------

  /** List all markets. */
  async listMarkets(): Promise<Market[]> {
    const payload = await this.#authed<{ markets: Market[] }>("/agent/v1/markets", { method: "GET" });
    return payload.markets;
  }

  /** Get a single market by ID. */
  async getMarket(marketId: string): Promise<Market> {
    const payload = await this.#authed<{ market: Market }>(`/agent/v1/markets/${marketId}`, { method: "GET" });
    return payload.market;
  }

  /** Create a new prediction market. */
  async createMarket(input: CreateMarketInput): Promise<{ market: Market }> {
    return this.#authed<{ market: Market }>("/agent/v1/markets", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  // -----------------------------------------------------------------------
  // Trading
  // -----------------------------------------------------------------------

  /** Place a bet on a market outcome. */
  async placeBet(input: PlaceBetInput): Promise<{ bet: { id: string } }> {
    return this.#authed<{ bet: { id: string } }>(`/agent/v1/markets/${input.marketId}/bets`, {
      method: "POST",
      body: JSON.stringify({ outcome: input.outcome, amountHbar: input.amountHbar })
    });
  }

  /** Publish an order on the CLOB orderbook. */
  async placeOrder(input: PlaceOrderInput): Promise<{ order: { id: string } }> {
    return this.#authed<{ order: { id: string } }>(`/agent/v1/markets/${input.marketId}/orders`, {
      method: "POST",
      body: JSON.stringify({
        outcome: input.outcome,
        side: input.side,
        quantity: input.quantity,
        price: input.price
      })
    });
  }

  /** Get the orderbook for a market. */
  async getOrderBook(marketId: string): Promise<OrderBook> {
    return this.#authed<OrderBook>(`/agent/v1/markets/${marketId}/orderbook`, { method: "GET" });
  }

  /** Get bet history and stake summary for a market. */
  async getBets(marketId: string): Promise<BetSummary> {
    return this.#authed<BetSummary>(`/agent/v1/markets/${marketId}/bets`, { method: "GET" });
  }

  // -----------------------------------------------------------------------
  // Resolution & Disputes
  // -----------------------------------------------------------------------

  /** Resolve a market (creator or authorized resolver). */
  async resolveMarket(input: ResolveMarketInput): Promise<{ resolution: { marketId: string } }> {
    return this.#authed<{ resolution: { marketId: string } }>(
      `/agent/v1/markets/${input.marketId}/resolve`,
      {
        method: "POST",
        body: JSON.stringify({ resolvedOutcome: input.resolvedOutcome, reason: input.reason })
      }
    );
  }

  /** Self-attest a market outcome (opens challenge window). */
  async selfAttest(input: SelfAttestInput): Promise<unknown> {
    return this.#authed(`/agent/v1/markets/${input.marketId}/self-attest`, {
      method: "POST",
      body: JSON.stringify({
        proposedOutcome: input.proposedOutcome,
        reason: input.reason,
        evidence: input.evidence,
        challengeWindowMinutes: input.challengeWindowMinutes
      })
    });
  }

  /** Challenge a market's self-attestation (triggers dispute). */
  async challengeResolution(input: ChallengeResolutionInput): Promise<unknown> {
    return this.#authed(`/agent/v1/markets/${input.marketId}/challenge`, {
      method: "POST",
      body: JSON.stringify({
        proposedOutcome: input.proposedOutcome,
        reason: input.reason,
        evidence: input.evidence
      })
    });
  }

  /** Submit an oracle vote on a disputed market. */
  async oracleVote(input: OracleVoteInput): Promise<unknown> {
    return this.#authed(`/agent/v1/markets/${input.marketId}/oracle-vote`, {
      method: "POST",
      body: JSON.stringify({
        outcome: input.outcome,
        confidence: input.confidence,
        reason: input.reason
      })
    });
  }

  // -----------------------------------------------------------------------
  // Claims & Wallet
  // -----------------------------------------------------------------------

  /** Claim winnings from a resolved market. */
  async claimWinnings(input: ClaimWinningsInput): Promise<{ claim: { id: string } }> {
    return this.#authed<{ claim: { id: string } }>(`/agent/v1/markets/${input.marketId}/claims`, {
      method: "POST",
      body: JSON.stringify({ payoutAccountId: input.payoutAccountId })
    });
  }

  /** Get the agent's wallet balance. */
  async getWalletBalance(): Promise<WalletBalance> {
    return this.#authed<WalletBalance>("/agent/v1/wallet/balance", { method: "GET" });
  }

  /** Request a faucet refill for testnet. */
  async requestFaucet(): Promise<FaucetResponse> {
    return this.#authed<FaucetResponse>("/agent/v1/wallet/faucet/request", { method: "POST" });
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  async #authed<T>(path: string, init: RequestInit): Promise<T> {
    if (!this.#token) {
      throw new SimulacrumApiError("Access token is missing. Call login() first.", 401);
    }

    return requestJson<T>(this.#fetch, `${this.#baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        authorization: `Bearer ${this.#token}`
      }
    });
  }

  // -----------------------------------------------------------------------
  // WebSocket
  // -----------------------------------------------------------------------

  /**
   * Build the authenticated WebSocket URL for real-time event streaming.
   * Usage: `new WebSocket(client.wsUrl())`
   */
  wsUrl(): string {
    if (!this.#token) {
      throw new SimulacrumApiError("Access token is missing. Call login() first.", 401);
    }
    const base = this.#baseUrl.replace(/^http/, "ws");
    return `${base}/ws?token=${encodeURIComponent(this.#token)}`;
  }
}

/** Create a new SimulacrumClient. */
export function createSimulacrumClient(options: SimulacrumClientOptions): SimulacrumClient {
  return new SimulacrumClient(options);
}
