import { randomUUID } from "node:crypto";

import {
  BaseAgent,
  createContrarianStrategy,
  createOpenClawAdapter,
  createRandomStrategy,
  createReputationBasedStrategy,
  type AgentMode,
  type AgentStrategy,
  type MarketSnapshot,
  type OpenClawAdapter
} from "@simulacrum/agents";
import {
  EncryptedInMemoryKeyStore,
  clamp,
  createAccount,
  createHederaClient,
  getBalance,
  transferHbar,
  type HederaNetwork,
  type PersistentStore
} from "@simulacrum/core";
import {
  challengeMarketResolution,
  claimWinnings,
  createMarket,
  getMarketStore,
  persistMarketStore,
  placeBet,
  publishOrder,
  resolveMarket,
  selfAttestMarket,
  submitOracleVote,
  type Market
} from "@simulacrum/markets";
import { calculateReputationScore, getReputationStore, submitAttestation } from "@simulacrum/reputation";

import type { ApiEvent, ApiEventBus } from "../events.js";
import type { AgentRegistry } from "../routes/agents.js";
import {
  EncryptedBotCredentialStore,
  type BotCredentialBundle
} from "./credential-store.js";
import {
  createWalletPersistence,
  type PersistedWallet,
  type WalletPersistenceStore
} from "../wallet-persistence.js";
import {
  LlmCognitionEngine,
  type ClawdbotGoal,
  type ClawdbotPlannedAction,
  type LlmProviderConfig,
  type MarketSentimentMap
} from "./llm-cognition.js";

type HederaClient = ReturnType<typeof createHederaClient>;

export interface ClawdbotNetworkOptions {
  eventBus: ApiEventBus;
  registry: AgentRegistry;
  enabled?: boolean;
  tickMs?: number;
  botCount?: number;
  initialBotBalanceHbar?: number;
  communityFundingHbar?: number;
  communityRefillThresholdHbar?: number;
  marketEveryTicks?: number;
  minOpenMarkets?: number;
  marketCloseMinutes?: number;
  minBetHbar?: number;
  maxBetHbar?: number;
  threadRetention?: number;
  oracleMinReputationScore?: number;
  oracleMinVoters?: number;
  oracleQuorumPercent?: number;
  llm?: LlmProviderConfig;
  hostedMode?: boolean;
  minActionIntervalMs?: number;
  maxActionsPerMinute?: number;
  credentialStoreSecret?: string;
}

export interface ClawdbotMessage {
  id: string;
  text: string;
  createdAt: string;
  botId?: string;
  botName?: string;
}

export interface CreateClawdbotEventMarketInput {
  prompt?: string;
  outcomes?: string[];
  initialOddsByOutcome?: Record<string, number>;
  lowLiquidity?: boolean;
  liquidityModel?: "CLOB" | "WEIGHTED_CURVE" | "HIGH_LIQUIDITY" | "LOW_LIQUIDITY";
  curveLiquidityHbar?: number;
  creatorBotId?: string;
  closeMinutes?: number;
}

export interface ClawdbotNetworkStatus {
  enabled: boolean;
  running: boolean;
  tickMs: number;
  tickCount: number;
  botCount: number;
  managedBotCount: number;
  threadLength: number;
  openMarkets: number;
  oracleMinReputationScore: number;
  oracleMinVoters: number;
  oracleQuorumPercent: number;
  trustedResolverCount: number;
  hostedMode?: boolean;
  activeHostedBots?: number;
  suspendedHostedBots?: number;
  demoScriptRunning?: boolean;
  lastDemoRunId?: string;
  lastDemoStartedAt?: string;
  lastDemoCompletedAt?: string;
  lastDemoError?: string;
  lastTickAt?: string;
  lastError?: string;
}

type ClawdbotStrategyName = "random" | "reputation" | "contrarian";

export interface ClawdbotProfile {
  id: string;
  name: string;
  accountId: string;
  strategy: string;
  mode: AgentMode;
  bankrollHbar: number;
  reputationScore: number;
  origin: "internal" | "community";
  joinedAt: string;
  hosted?: boolean;
  active?: boolean;
  suspended?: boolean;
}

export interface JoinClawdbotInput {
  name: string;
  accountId: string;
  privateKey: string;
  privateKeyType?: AgentWallet["privateKeyType"];
  strategy?: ClawdbotStrategyName;
  mode?: AgentMode;
  bankrollHbar?: number;
  reputationScore?: number;
  llm?: LlmProviderConfig;
  hosted?: boolean;
  ownerId?: string;
}

export interface PlaceClawdbotBetInput {
  marketId: string;
  outcome: string;
  amountHbar: number;
}

export interface PlaceClawdbotOrderInput {
  marketId: string;
  outcome: string;
  side: "BID" | "ASK";
  quantity: number;
  price: number;
}

export interface ResolveClawdbotMarketInput {
  marketId: string;
  resolvedOutcome: string;
  reason?: string;
}

export interface ClawdbotDemoRun {
  runId: string;
  status: "started";
  source: "demo-script";
}

export interface RegisterHostedClawdbotInput extends JoinClawdbotInput {
  ownerId: string;
}

export interface HostedBotStatus {
  botId: string;
  ownerId?: string;
  active: boolean;
  suspended: boolean;
  hosted: boolean;
  createdAt: string;
  updatedAt: string;
  lastActionAt?: string;
  actionsInCurrentWindow: number;
}

interface AgentWallet {
  accountId: string;
  privateKey: string;
  privateKeyType: "der" | "ecdsa" | "ed25519" | "auto";
}

interface RuntimeBot {
  agent: BaseAgent;
  wallet: AgentWallet;
  adapter: OpenClawAdapter;
  origin: "internal" | "community";
  joinedAt: string;
  llm?: LlmProviderConfig;
  hosted?: boolean;
  ownerId?: string;
}

interface HostedBotControl {
  botId: string;
  ownerId?: string;
  apiToken?: string;
  active: boolean;
  suspended: boolean;
  hosted: boolean;
  createdAt: string;
  updatedAt: string;
  lastActionAt?: string;
  windowStartedAt: number;
  actionsInWindow: number;
}

interface MarketSentiment {
  [outcome: string]: number;
}

const DEFAULT_TICK_MS = 15_000;
const DEFAULT_ORACLE_MIN_REPUTATION_SCORE = 65;
const DEFAULT_ORACLE_MIN_VOTERS = 2;
const DEFAULT_ORACLE_QUORUM_PERCENT = 0.6;
const ORACLE_VOTE_SCORE_DELTA_CORRECT = 5;
const ORACLE_VOTE_SCORE_DELTA_INCORRECT = -5;
const INCORRECT_SELF_ATTESTATION_SCORE_DELTA = -8;

function normalizeNetwork(value: string | undefined): HederaNetwork {
  const candidate = (value ?? "testnet").toLowerCase();

  if (candidate === "testnet" || candidate === "mainnet" || candidate === "previewnet") {
    return candidate;
  }

  return "testnet";
}

function normalizePrivateKeyType(value: string | undefined): AgentWallet["privateKeyType"] {
  const candidate = (value ?? "auto").toLowerCase();

  if (candidate === "ecdsa" || candidate === "ed25519" || candidate === "der" || candidate === "auto") {
    return candidate;
  }

  return "auto";
}

function toMarketSnapshot(market: Market): MarketSnapshot {
  return {
    id: market.id,
    question: market.question,
    creatorAccountId: market.creatorAccountId,
    outcomes: market.outcomes,
    status: market.status,
    closeTime: market.closeTime
  };
}

function parseNonEmptyString(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return fallback;
}

function parsePositiveNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  return fallback;
}

function parseUnitInterval(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clamp(value, 0, 1);
  }

  return clamp(fallback, 0, 1);
}

function parseOutcomes(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const parsed = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);

  if (parsed.length < 2) {
    return undefined;
  }

  return parsed;
}

function parseInitialOddsByOutcome(
  value: unknown,
  outcomes: readonly string[]
): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const rawEntries = Object.entries(value as Record<string, unknown>);

  if (rawEntries.length === 0) {
    return undefined;
  }

  const normalized = Object.fromEntries(
    rawEntries
      .map(([key, odds]) => [key.trim().toUpperCase(), typeof odds === "number" ? odds : Number.NaN])
      .filter(([, odds]) => Number.isFinite(odds))
  ) as Record<string, number>;
  const filteredOutcomes = outcomes.length > 0 ? outcomes : ["YES", "NO"];
  const byOutcome: Record<string, number> = {};
  let total = 0;

  for (const outcome of filteredOutcomes) {
    const valueForOutcome = normalized[outcome];
    const weight = Number.isFinite(valueForOutcome) && valueForOutcome > 0 ? valueForOutcome : 0;
    byOutcome[outcome] = weight;
    total += weight;
  }

  if (total <= 0) {
    return undefined;
  }

  return byOutcome;
}

function defaultInitialOddsByOutcome(
  outcomes: readonly string[],
  strategyName: string
): Record<string, number> | undefined {
  const resolvedOutcomes = outcomes.length > 0 ? outcomes : ["YES", "NO"];

  if (resolvedOutcomes.length < 2) {
    return undefined;
  }

  const firstOutcomeBias =
    strategyName === "reputation-based"
      ? 64
      : strategyName === "contrarian"
        ? 42
        : 57;
  const oddsByOutcome: Record<string, number> = {};

  if (resolvedOutcomes.length === 2) {
    const first = resolvedOutcomes[0];
    const second = resolvedOutcomes[1];

    if (!first || !second) {
      return undefined;
    }

    oddsByOutcome[first] = firstOutcomeBias;
    oddsByOutcome[second] = 100 - firstOutcomeBias;
    return oddsByOutcome;
  }

  const base = 100 / resolvedOutcomes.length;
  let running = 0;

  for (let index = 0; index < resolvedOutcomes.length; index += 1) {
    const outcome = resolvedOutcomes[index];

    if (!outcome) {
      continue;
    }

    if (index === 0) {
      oddsByOutcome[outcome] = Math.max(base, firstOutcomeBias);
      running += oddsByOutcome[outcome];
      continue;
    }

    if (index === resolvedOutcomes.length - 1) {
      oddsByOutcome[outcome] = Math.max(1, 100 - running);
      continue;
    }

    const remainingSlots = resolvedOutcomes.length - index;
    const remainingWeight = Math.max(1, 100 - running);
    const value = Math.max(1, Math.floor(remainingWeight / remainingSlots));
    oddsByOutcome[outcome] = value;
    running += value;
  }

  return oddsByOutcome;
}

export class ClawdbotNetwork {
  readonly #eventBus: ApiEventBus;
  readonly #registry: AgentRegistry;
  readonly #enabled: boolean;
  readonly #tickMs: number;
  readonly #targetBots: number;
  readonly #initialBotBalanceHbar: number;
  readonly #communityFundingHbar: number;
  readonly #communityRefillThresholdHbar: number;
  readonly #marketCloseMinutes: number;
  readonly #minBetHbar: number;
  readonly #maxBetHbar: number;
  readonly #threadRetention: number;
  readonly #oracleMinReputationScore: number;
  readonly #oracleMinVoters: number;
  readonly #oracleQuorumPercent: number;
  readonly #llmConfig: LlmProviderConfig;
  readonly #cognition: LlmCognitionEngine;
  readonly #hostedMode: boolean;
  readonly #minActionIntervalMs: number;
  readonly #maxActionsPerMinute: number;
  readonly #credentialStore: EncryptedBotCredentialStore;

  readonly #network: HederaNetwork;
  readonly #operatorAccountId: string;
  readonly #operatorPrivateKey: string;
  readonly #operatorPrivateKeyType: AgentWallet["privateKeyType"];

  readonly #keyStore: EncryptedInMemoryKeyStore;
  readonly #runtimeBots = new Map<string, RuntimeBot>();
  readonly #clientCache = new Map<string, HederaClient>();
  readonly #thread: ClawdbotMessage[] = [];
  readonly #goalsByBotId = new Map<string, ClawdbotGoal>();
  readonly #consecutiveFailures = new Map<string, number>();
  readonly #hostedControl = new Map<string, HostedBotControl>();
  #eventSubscription: (() => void) | null = null;
  readonly #activeDisputeBroadcasts = new Set<string>();
  readonly #walletStore: PersistentStore<WalletPersistenceStore>;
  #escrowWallet: PersistedWallet | null = null;

  #interval: ReturnType<typeof setInterval> | null = null;
  #running = false;
  #tickCount = 0;
  #lastTickAt: Date | null = null;
  #lastError: string | null = null;
  #activeTick = false;
  #demoScriptActive = false;
  #lastDemoRunId: string | null = null;
  #lastDemoStartedAt: Date | null = null;
  #lastDemoCompletedAt: Date | null = null;
  #lastDemoError: string | null = null;

  constructor(options: ClawdbotNetworkOptions) {
    this.#eventBus = options.eventBus;
    this.#registry = options.registry;
    this.#enabled = options.enabled ?? false;
    this.#tickMs = options.tickMs ?? DEFAULT_TICK_MS;
    this.#targetBots = options.botCount ?? 3;
    this.#initialBotBalanceHbar = options.initialBotBalanceHbar ?? 25;
    this.#communityFundingHbar = options.communityFundingHbar
      ?? Number(process.env.CLAWDBOT_COMMUNITY_FUNDING_HBAR || 100);
    this.#communityRefillThresholdHbar = options.communityRefillThresholdHbar
      ?? Number(process.env.CLAWDBOT_COMMUNITY_REFILL_THRESHOLD_HBAR || 25);
    this.#marketCloseMinutes = options.marketCloseMinutes ?? 20;
    this.#minBetHbar = options.minBetHbar ?? 1;
    this.#maxBetHbar = options.maxBetHbar ?? 4;
    this.#threadRetention = options.threadRetention ?? 400;
    this.#oracleMinReputationScore = clamp(
      parsePositiveNumber(
        options.oracleMinReputationScore ?? Number(process.env.CLAWDBOT_ORACLE_MIN_REPUTATION_SCORE),
        DEFAULT_ORACLE_MIN_REPUTATION_SCORE
      ),
      0,
      100
    );
    this.#oracleMinVoters = Math.max(
      1,
      Math.round(
        parsePositiveNumber(
          options.oracleMinVoters ?? Number(process.env.CLAWDBOT_ORACLE_MIN_VOTERS),
          DEFAULT_ORACLE_MIN_VOTERS
        )
      )
    );
    this.#oracleQuorumPercent = parseUnitInterval(
      options.oracleQuorumPercent ??
        Number(process.env.CLAWDBOT_ORACLE_QUORUM_PERCENT ?? process.env.MARKET_ORACLE_QUORUM_PERCENT),
      DEFAULT_ORACLE_QUORUM_PERCENT
    );
    this.#llmConfig = {
      provider: options.llm?.provider ?? "openai",
      apiKey: options.llm?.apiKey ?? process.env.CLAWDBOT_LLM_API_KEY ?? process.env.OPENAI_API_KEY,
      model: options.llm?.model ?? process.env.CLAWDBOT_LLM_MODEL ?? process.env.OPENAI_MODEL,
      baseUrl: options.llm?.baseUrl ?? process.env.CLAWDBOT_LLM_BASE_URL
    };
    this.#cognition = new LlmCognitionEngine(this.#llmConfig);
    this.#hostedMode = options.hostedMode ?? false;
    this.#minActionIntervalMs = Math.max(
      0,
      Math.round(
        parsePositiveNumber(options.minActionIntervalMs ?? Number(process.env.CLAWDBOT_MIN_ACTION_INTERVAL_MS), 2_000)
      )
    );
    this.#maxActionsPerMinute = Math.max(
      1,
      Math.round(
        parsePositiveNumber(options.maxActionsPerMinute ?? Number(process.env.CLAWDBOT_MAX_ACTIONS_PER_MINUTE), 10)
      )
    );
    const credentialSecret =
      options.credentialStoreSecret ??
      process.env.CLAWDBOT_CREDENTIALS_SECRET ??
      process.env.HEDERA_KEYSTORE_SECRET ??
      "simulacrum-clawdbot-credentials";
    this.#credentialStore = new EncryptedBotCredentialStore(credentialSecret);

    this.#network = normalizeNetwork(process.env.HEDERA_NETWORK);
    this.#operatorAccountId = process.env.HEDERA_ACCOUNT_ID ?? "";
    this.#operatorPrivateKey = process.env.HEDERA_PRIVATE_KEY ?? "";
    this.#operatorPrivateKeyType = normalizePrivateKeyType(process.env.HEDERA_PRIVATE_KEY_TYPE);
    this.#keyStore = new EncryptedInMemoryKeyStore(
      process.env.HEDERA_KEYSTORE_SECRET ?? "simulacrum-clawdbot-network"
    );
    this.#walletStore = createWalletPersistence("clawdbot-wallets.json");

    if (this.#enabled && (!this.#operatorAccountId || !this.#operatorPrivateKey)) {
      throw new Error(
        "Clawdbot network requires HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in environment."
      );
    }
  }

  getStatus(): ClawdbotNetworkStatus {
    const store = getMarketStore();
    const openMarkets = Array.from(store.markets.values()).filter((market) => market.status === "OPEN").length;
    const trustedResolverCount = this.getTrustedResolverRuntimes(this.buildReputationMap()).length;
    const hostedEntries = Array.from(this.#hostedControl.values());
    const activeHostedBots = hostedEntries.filter((entry) => entry.active && !entry.suspended).length;
    const suspendedHostedBots = hostedEntries.filter((entry) => entry.suspended).length;

    return {
      enabled: this.#enabled,
      running: this.#running,
      tickMs: this.#tickMs,
      tickCount: this.#tickCount,
      botCount: this.#registry.all().length,
      managedBotCount: this.#runtimeBots.size,
      threadLength: this.#thread.length,
      openMarkets,
      oracleMinReputationScore: this.#oracleMinReputationScore,
      oracleMinVoters: this.#oracleMinVoters,
      oracleQuorumPercent: this.#oracleQuorumPercent,
      trustedResolverCount,
      hostedMode: this.#hostedMode,
      activeHostedBots,
      suspendedHostedBots,
      demoScriptRunning: this.#demoScriptActive,
      lastDemoRunId: this.#lastDemoRunId ?? undefined,
      lastDemoStartedAt: this.#lastDemoStartedAt?.toISOString(),
      lastDemoCompletedAt: this.#lastDemoCompletedAt?.toISOString(),
      lastDemoError: this.#lastDemoError ?? undefined,
      lastTickAt: this.#lastTickAt?.toISOString(),
      lastError: this.#lastError ?? undefined
    };
  }

  getThread(limit = 50): ClawdbotMessage[] {
    const cappedLimit = Math.max(1, Math.round(limit));
    return this.#thread.slice(-cappedLimit);
  }

  listBots(): ClawdbotProfile[] {
    const reputationByAccount = this.buildReputationMap();
    return Array.from(this.#runtimeBots.values()).map((runtime) =>
      this.toBotProfile(runtime, reputationByAccount[runtime.wallet.accountId])
    );
  }

  listGoals(botId?: string): ClawdbotGoal[] {
    if (botId) {
      const goal = this.#goalsByBotId.get(botId);
      return goal ? [goal] : [];
    }

    return Array.from(this.#goalsByBotId.values()).sort((left, right) =>
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    );
  }

  async registerHostedBot(input: RegisterHostedClawdbotInput): Promise<{
    bot: ClawdbotProfile;
    apiToken: string;
    warning: string;
  }> {
    const profile = await this.joinCommunityBot({
      ...input,
      hosted: true,
      ownerId: input.ownerId
    });
    const runtime = this.getBot(profile.id);
    const apiToken = randomUUID();
    const now = new Date().toISOString();
    const control: HostedBotControl = {
      botId: profile.id,
      ownerId: input.ownerId,
      apiToken,
      active: true,
      suspended: false,
      hosted: true,
      createdAt: now,
      updatedAt: now,
      windowStartedAt: Date.now(),
      actionsInWindow: 0
    };

    this.#hostedControl.set(profile.id, control);
    this.#credentialStore.save(profile.id, {
      hedera: {
        accountId: runtime.wallet.accountId,
        privateKey: runtime.wallet.privateKey,
        privateKeyType: runtime.wallet.privateKeyType
      },
      llm: runtime.llm,
      updatedAt: now
    });
    if (runtime.llm) {
      runtime.llm = {
        provider: runtime.llm.provider,
        model: runtime.llm.model,
        baseUrl: runtime.llm.baseUrl
      };
    }
    this.#eventBus.publish("clawdbot.hosted.registered", {
      botId: profile.id,
      ownerId: input.ownerId,
      hosted: true
    });

    return {
      bot: this.toBotProfile(runtime),
      apiToken,
      warning: "Store this token securely. It is only shown once for demo hosting control."
    };
  }

  startHostedBot(botId: string): HostedBotStatus {
    const control = this.requireHostedControl(botId);
    control.active = true;
    control.updatedAt = new Date().toISOString();
    this.#eventBus.publish("clawdbot.hosted.started", {
      botId
    });

    return this.toHostedStatus(control);
  }

  stopHostedBot(botId: string): HostedBotStatus {
    const control = this.requireHostedControl(botId);
    control.active = false;
    control.updatedAt = new Date().toISOString();
    this.#eventBus.publish("clawdbot.hosted.stopped", {
      botId
    });

    return this.toHostedStatus(control);
  }

  suspendHostedBot(botId: string, suspended: boolean): HostedBotStatus {
    const control = this.requireHostedControl(botId);
    control.suspended = suspended;
    if (suspended) {
      control.active = false;
    }
    control.updatedAt = new Date().toISOString();
    this.#eventBus.publish(suspended ? "clawdbot.hosted.suspended" : "clawdbot.hosted.unsuspended", {
      botId
    });

    return this.toHostedStatus(control);
  }

  getHostedBotStatus(botId: string): HostedBotStatus {
    const control = this.requireHostedControl(botId);
    return this.toHostedStatus(control);
  }

  rotateHostedBotCredentials(
    botId: string,
    update: {
      privateKey?: string;
      privateKeyType?: AgentWallet["privateKeyType"];
      llm?: LlmProviderConfig;
    }
  ): HostedBotStatus {
    const control = this.requireHostedControl(botId);
    const runtime = this.getBot(botId);
    const existing = this.#credentialStore.load(botId);

    if (!existing) {
      throw new Error(`No hosted credentials exist for bot ${botId}.`);
    }

    const rotated = this.#credentialStore.rotate(botId, {
      hedera: {
        accountId: runtime.wallet.accountId,
        privateKey: update.privateKey ?? existing.hedera.privateKey,
        privateKeyType: normalizePrivateKeyType(update.privateKeyType ?? existing.hedera.privateKeyType)
      },
      llm: update.llm ?? existing.llm
    });

    runtime.wallet = {
      accountId: rotated.hedera.accountId,
      privateKey: rotated.hedera.privateKey,
      privateKeyType: normalizePrivateKeyType(rotated.hedera.privateKeyType)
    };
    runtime.llm = rotated.llm;
    runtime.adapter = this.createAdapter(runtime.agent, runtime.wallet);
    control.updatedAt = new Date().toISOString();
    this.#eventBus.publish("clawdbot.hosted.credentials_rotated", {
      botId
    });

    return this.toHostedStatus(control);
  }

  async joinCommunityBot(input: JoinClawdbotInput): Promise<ClawdbotProfile> {
    if (!this.#enabled) {
      throw new Error("Clawdbot network is disabled.");
    }

    const name = parseNonEmptyString(input.name, "");
    const accountId = parseNonEmptyString(input.accountId, "");
    const privateKey = parseNonEmptyString(input.privateKey, "");

    if (!name) {
      throw new Error("name is required.");
    }

    if (!accountId) {
      throw new Error("accountId is required.");
    }

    if (!privateKey) {
      throw new Error("privateKey is required.");
    }

    const duplicate = Array.from(this.#runtimeBots.values()).find(
      (runtime) => runtime.wallet.accountId === accountId
    );

    if (duplicate) {
      throw new Error(`A ClawDBot with account ${accountId} already exists.`);
    }

    const wallet: AgentWallet = {
      accountId,
      privateKey,
      privateKeyType: normalizePrivateKeyType(input.privateKeyType)
    };
    const strategy = this.strategyForName(input.strategy);
    const agent = new BaseAgent(
      {
        id: randomUUID(),
        name,
        accountId,
        bankrollHbar: Math.max(1, Math.round(input.bankrollHbar ?? this.#communityFundingHbar)),
        reputationScore: clamp(input.reputationScore ?? 50, 0, 100),
        mode: input.mode ?? "BALANCED"
      },
      strategy
    );

    // Validates key/account shape early and caches signer for this bot.
    this.getClient(wallet);

    const runtime: RuntimeBot = {
      agent,
      wallet,
      adapter: this.createAdapter(agent, wallet),
      origin: "community",
      joinedAt: new Date().toISOString(),
      llm: input.llm,
      hosted: input.hosted ?? false,
      ownerId: input.ownerId
    };

    this.#runtimeBots.set(agent.id, runtime);
    this.#registry.add(agent);

    const profile = this.toBotProfile(runtime);

    this.postMessage(`${profile.name} joined the open ClawDBot community.`, profile.id);
    this.#eventBus.publish("clawdbot.joined", profile);

    return profile;
  }

  postBotMessage(botId: string, text: string): ClawdbotMessage {
    this.getBot(botId);
    return this.postMessage(text, botId);
  }

  async createMarketAsBot(
    botId: string,
    input: Omit<CreateClawdbotEventMarketInput, "creatorBotId">
  ): Promise<{ marketId: string }> {
    return this.createEventMarket({
      ...input,
      creatorBotId: botId
    });
  }

  async placeBetAsBot(botId: string, input: PlaceClawdbotBetInput): Promise<{ betId: string }> {
    const runtime = this.getBot(botId);

    const result = await runtime.adapter.handleToolCall({
      name: "place_bet",
      args: {
        marketId: input.marketId,
        outcome: input.outcome,
        amountHbar: input.amountHbar
      }
    });

    const betId =
      typeof result === "object" && result && "betId" in result
        ? parseNonEmptyString((result as { betId?: unknown }).betId, "")
        : "";

    if (!betId) {
      throw new Error(`Failed to place bet for bot ${botId}.`);
    }

    this.#eventBus.publish("clawdbot.bet.external", {
      botId,
      marketId: input.marketId,
      betId
    });

    return { betId };
  }

  async placeOrderAsBot(botId: string, input: PlaceClawdbotOrderInput): Promise<{ orderId: string }> {
    const runtime = this.getBot(botId);
    const order = await publishOrder(
      {
        marketId: input.marketId,
        accountId: runtime.wallet.accountId,
        outcome: input.outcome,
        side: input.side,
        quantity: input.quantity,
        price: input.price
      },
      {
        client: this.getClient(runtime.wallet)
      }
    );

    this.#eventBus.publish("clawdbot.order.placed", {
      botId,
      marketId: input.marketId,
      orderId: order.id,
      side: input.side,
      quantity: input.quantity,
      price: input.price
    });
    this.#eventBus.publish("market.order", {
      ...order,
      botId
    });

    return { orderId: order.id };
  }

  listOrdersForBot(botId: string, openOnly = false): Array<{
    id: string;
    marketId: string;
    accountId: string;
    outcome: string;
    side: "BID" | "ASK";
    quantity: number;
    price: number;
    createdAt: string;
    status: "OPEN" | "CANCELLED" | "FILLED";
  }> {
    const runtime = this.getBot(botId);
    const store = getMarketStore();
    const orders = Array.from(store.orders.values()).flatMap((entries) => entries);

    return orders
      .filter((order) => order.accountId === runtime.wallet.accountId)
      .filter((order) => !openOnly || order.status === "OPEN")
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }

  async resolveMarketAsBot(
    botId: string,
    input: ResolveClawdbotMarketInput
  ): Promise<{ marketId: string; resolvedOutcome: string }> {
    const runtime = this.getBot(botId);

    const result = await runtime.adapter.handleToolCall({
      name: "resolve_market",
      args: {
        marketId: input.marketId,
        resolvedOutcome: input.resolvedOutcome,
        reason: input.reason
      }
    });

    const marketId =
      typeof result === "object" && result && "marketId" in result
        ? parseNonEmptyString((result as { marketId?: unknown }).marketId, "")
        : "";
    const resolvedOutcome =
      typeof result === "object" && result && "resolvedOutcome" in result
        ? parseNonEmptyString((result as { resolvedOutcome?: unknown }).resolvedOutcome, "")
        : parseNonEmptyString(input.resolvedOutcome, "");

    if (!marketId) {
      throw new Error(`Failed to resolve market for bot ${botId}.`);
    }

    this.#eventBus.publish("clawdbot.resolve.external", {
      botId,
      marketId,
      resolvedOutcome
    });

    return {
      marketId,
      resolvedOutcome
    };
  }

  postMessage(text: string, botId?: string): ClawdbotMessage {
    const parsedText = parseNonEmptyString(text, "status_ping");
    const runtime = botId ? this.#runtimeBots.get(botId) : undefined;

    const message: ClawdbotMessage = {
      id: randomUUID(),
      text: parsedText,
      createdAt: new Date().toISOString(),
      botId: runtime?.agent.id,
      botName: runtime?.agent.name
    };

    this.#thread.push(message);

    if (this.#thread.length > this.#threadRetention) {
      this.#thread.splice(0, this.#thread.length - this.#threadRetention);
    }

    this.#eventBus.publish("clawdbot.message", message);

    return message;
  }

  async runScriptedTimelineDemo(): Promise<ClawdbotDemoRun> {
    if (!this.#enabled) {
      throw new Error("Clawdbot network is disabled.");
    }

    if (this.#demoScriptActive) {
      throw new Error("A demo script is already running.");
    }

    await this.ensureBotPopulation();

    const runId = randomUUID();
    this.#demoScriptActive = true;
    this.#lastDemoRunId = runId;
    this.#lastDemoStartedAt = new Date();
    this.#lastDemoCompletedAt = null;
    this.#lastDemoError = null;

    this.#eventBus.publish("clawdbot.demo.started", {
      runId,
      demo: true,
      source: "demo-script"
    });

    const run = async () => {
      try {
        const bots = Array.from(this.#runtimeBots.values());

        if (bots.length < 3) {
          throw new Error("Demo timeline requires at least three bots.");
        }

        const creator = bots[0];
        const trader = bots[1];
        const resolver = bots[2];
        const participants = [creator, trader, resolver, ...bots.slice(3)].filter(
          (runtime, index, all) => all.findIndex((candidate) => candidate.agent.id === runtime.agent.id) === index
        );

        const liquidityMarket = await this.createEventMarket({
          creatorBotId: creator.agent.id,
          prompt: `[DEMO] MCP-style bot swarm liquidity stress test (open market).`,
          outcomes: ["YES", "NO"],
          closeMinutes: 18
        });
        const lifecycleMarket = await this.createEventMarket({
          creatorBotId: trader.agent.id,
          prompt: `[DEMO] MCP-style bot swarm can complete dispute + oracle + settlement flow this run.`,
          outcomes: ["YES", "NO"],
          closeMinutes: 8
        });

        this.#eventBus.publish("clawdbot.demo.market.seeded", {
          runId,
          liquidityMarketId: liquidityMarket.marketId,
          lifecycleMarketId: lifecycleMarket.marketId,
          demo: true,
          source: "demo-script"
        });
        this.postMessage(
          `[DEMO][MCP] ${creator.agent.name} -> tool.create_market(liquidity + lifecycle scenarios)`,
          creator.agent.id
        );

        let ordersPlaced = 0;
        let betsPlaced = 0;
        const orderCoverage: Record<`${"YES" | "NO"}_${"BID" | "ASK"}`, number> = {
          YES_BID: 0,
          YES_ASK: 0,
          NO_BID: 0,
          NO_ASK: 0
        };
        const placeDemoOrder = async (
          runtime: RuntimeBot,
          marketId: string,
          outcome: "YES" | "NO",
          side: "BID" | "ASK",
          quantity: number,
          price: number
        ): Promise<void> => {
          const order = await publishOrder(
            {
              marketId,
              accountId: runtime.wallet.accountId,
              outcome,
              side,
              quantity: clamp(Math.round(quantity), 1, 100),
              price: clamp(price, 0.01, 0.99)
            },
            { client: this.getClient(runtime.wallet) }
          );
          ordersPlaced += 1;

          this.#eventBus.publish("clawdbot.order.placed", {
            botId: runtime.agent.id,
            marketId,
            orderId: order.id,
            side,
            quantity: order.quantity,
            price: order.price,
            demo: true,
            source: "demo-script"
          });
          this.#eventBus.publish("market.order", {
            ...order,
            botId: runtime.agent.id,
            demo: true,
            source: "demo-script"
          });
        };
        const placeDemoBet = async (
          runtime: RuntimeBot,
          marketId: string,
          outcome: "YES" | "NO",
          amountHbar: number
        ): Promise<void> => {
          const amount = clamp(Number(amountHbar.toFixed(2)), this.#minBetHbar, this.#maxBetHbar);
          const bet = await placeBet(
            {
              marketId,
              bettorAccountId: runtime.wallet.accountId,
              outcome,
              amountHbar: amount
            },
            { client: this.getClient(runtime.wallet) }
          );

          runtime.agent.adjustBankroll(-amount);
          betsPlaced += 1;
          this.#eventBus.publish("clawdbot.bet.placed", {
            botId: runtime.agent.id,
            marketId,
            outcome,
            amountHbar: amount,
            rationale: "[DEMO][MCP] scripted feature validation trade"
          });
          this.#eventBus.publish("market.bet", {
            ...bet,
            botId: runtime.agent.id,
            demo: true,
            source: "demo-script"
          });
        };

        for (let round = 0; round < 8; round += 1) {
          for (let index = 0; index < participants.length; index += 1) {
            const runtime = participants[index];
            const targetMarketId =
              round < 6 || index % 2 === 0 ? liquidityMarket.marketId : lifecycleMarket.marketId;
            const marketBias = round < 6 ? 0.03 : -0.02;
            const baseYesPrice = clamp(
              0.5 + marketBias + ((round % 5) - 2) * 0.045 + (index - participants.length / 2) * 0.012,
              0.12,
              0.88
            );
            const baseNoPrice = 1 - baseYesPrice;
            const spread = clamp(0.05 + ((round + index) % 3) * 0.015, 0.04, 0.12);
            const baseQuantity = 6 + ((round * 5 + index * 3) % 12);

            const quotes: Array<{
              outcome: "YES" | "NO";
              side: "BID" | "ASK";
              quantity: number;
              price: number;
            }> = [
              {
                outcome: "YES",
                side: "BID",
                quantity: baseQuantity + 2,
                price: baseYesPrice - spread / 2
              },
              {
                outcome: "YES",
                side: "ASK",
                quantity: baseQuantity + 1,
                price: baseYesPrice + spread / 2
              },
              {
                outcome: "NO",
                side: "BID",
                quantity: baseQuantity + 1,
                price: baseNoPrice - spread / 2
              },
              {
                outcome: "NO",
                side: "ASK",
                quantity: baseQuantity + 2,
                price: baseNoPrice + spread / 2
              }
            ];

            for (const quote of quotes) {
              await placeDemoOrder(
                runtime,
                targetMarketId,
                quote.outcome,
                quote.side,
                quote.quantity,
                quote.price
              );
              orderCoverage[`${quote.outcome}_${quote.side}`] += 1;
            }

            const primaryBetOutcome: "YES" | "NO" = (round + index) % 2 === 0 ? "YES" : "NO";
            await placeDemoBet(
              runtime,
              targetMarketId,
              primaryBetOutcome,
              1.0 + ((round + index) % 3) * 0.65
            );

            if ((round + index) % 3 === 0) {
              const hedgeOutcome: "YES" | "NO" = primaryBetOutcome === "YES" ? "NO" : "YES";
              await placeDemoBet(
                runtime,
                targetMarketId,
                hedgeOutcome,
                1.0 + ((round + index) % 2) * 0.45
              );
            }
          }

          await this.pause(120);
        }

        this.postMessage(
          `[DEMO][MCP] seeded ${ordersPlaced} orders + ${betsPlaced} bets (YES/BID=${orderCoverage.YES_BID}, YES/ASK=${orderCoverage.YES_ASK}, NO/BID=${orderCoverage.NO_BID}, NO/ASK=${orderCoverage.NO_ASK}) across liquidity + lifecycle markets`,
          trader.agent.id
        );

        const selfAttestation = await selfAttestMarket(
          {
            marketId: lifecycleMarket.marketId,
            attestedByAccountId: resolver.wallet.accountId,
            proposedOutcome: "YES",
            reason: "[DEMO][MCP] resolver self-attestation before oracle voting",
            challengeWindowMinutes: 6
          },
          { client: this.getClient(resolver.wallet) }
        );
        this.#eventBus.publish("market.self_attested", {
          marketId: lifecycleMarket.marketId,
          ...selfAttestation.selfAttestation,
          challengeWindowEndsAt: selfAttestation.challengeWindowEndsAt,
          demo: true,
          source: "demo-script"
        });
        this.#eventBus.publish("clawdbot.market.self_attested", {
          marketId: lifecycleMarket.marketId,
          resolvedOutcome: selfAttestation.selfAttestation.proposedOutcome,
          resolverBotId: resolver.agent.id,
          challengeWindowEndsAt: selfAttestation.challengeWindowEndsAt,
          demo: true,
          source: "demo-script"
        });

        await this.pause(240);

        const challenge = await challengeMarketResolution(
          {
            marketId: lifecycleMarket.marketId,
            challengerAccountId: trader.wallet.accountId,
            proposedOutcome: "NO",
            reason: "[DEMO][MCP] challenger requests oracle adjudication"
          },
          { client: this.getClient(trader.wallet) }
        );
        this.#eventBus.publish("market.challenged", {
          ...challenge.challenge,
          demo: true,
          source: "demo-script"
        });
        this.#eventBus.publish("clawdbot.market.challenged", {
          marketId: lifecycleMarket.marketId,
          challenge: challenge.challenge,
          demo: true,
          source: "demo-script"
        });

        await this.pause(240);

        const votingPool = participants
          .filter((runtime) => {
            const marketSnapshot = getMarketStore().markets.get(lifecycleMarket.marketId);
            return !this.isIneligibleOracleVoter(marketSnapshot, runtime.wallet.accountId);
          })
          .slice(0, Math.max(2, Math.min(4, participants.length)));
        let finalized:
          | {
              marketId: string;
              resolvedOutcome: string;
              resolvedByAccountId: string;
            }
          | undefined;

        for (let index = 0; index < votingPool.length; index += 1) {
          const runtime = votingPool[index];
          const outcome = index === 1 ? "NO" : "YES";
          const vote = await submitOracleVote(
            {
              marketId: lifecycleMarket.marketId,
              voterAccountId: runtime.wallet.accountId,
              outcome,
              confidence: clamp(0.64 + index * 0.11, 0.3, 0.99),
              reason: "[DEMO][MCP] oracle vote from a simulated tool-capable agent",
              reputationScore: runtime.agent.reputationScore
            },
            {
              client: this.getClient(runtime.wallet),
              oracleMinVotes: this.#oracleMinVoters,
              oracleEligibleVoterCount: participants.length,
              oracleQuorumPercent: this.#oracleQuorumPercent
            }
          );

          this.#eventBus.publish("market.oracle_vote", {
            ...vote.vote,
            demo: true,
            source: "demo-script"
          });
          this.#eventBus.publish("clawdbot.market.oracle_vote", {
            marketId: lifecycleMarket.marketId,
            vote: vote.vote,
            demo: true,
            source: "demo-script"
          });

          if (vote.finalized) {
            finalized = vote.finalized;
            const oracleVotes = (getMarketStore().markets.get(lifecycleMarket.marketId)?.oracleVotes ?? []).map(
              (entry) => ({
                id: entry.id,
                voterAccountId: entry.voterAccountId,
                outcome: entry.outcome,
                confidence: entry.confidence
              })
            );
            await this.applyOracleVoteReputation(
              lifecycleMarket.marketId,
              vote.finalized.resolvedOutcome,
              oracleVotes,
              {
                attesterAccountId: vote.finalized.resolvedByAccountId
              }
            );
            await this.applySelfAttestationReputation(
              lifecycleMarket.marketId,
              vote.finalized.resolvedOutcome,
              getMarketStore().markets.get(lifecycleMarket.marketId)?.selfAttestation,
              { attesterAccountId: vote.finalized.resolvedByAccountId }
            );
            this.#eventBus.publish("clawdbot.market.resolved", {
              marketId: lifecycleMarket.marketId,
              resolvedOutcome: vote.finalized.resolvedOutcome,
              resolverBotId: runtime.agent.id,
              oracleConfidence: vote.vote.confidence,
              demo: true,
              source: "demo-script"
            });
            break;
          }

          await this.pause(120);
        }

        if (!finalized) {
          const fallback = await resolveMarket(
            {
              marketId: lifecycleMarket.marketId,
              resolvedOutcome: "YES",
              resolvedByAccountId: resolver.wallet.accountId,
              reason: "[DEMO] fallback scripted resolution"
            },
            { client: this.getClient(resolver.wallet) }
          );
          finalized = fallback;
          this.#eventBus.publish("market.resolved", {
            ...fallback,
            demo: true,
            source: "demo-script"
          });
          this.#eventBus.publish("clawdbot.market.resolved", {
            marketId: fallback.marketId,
            resolvedOutcome: fallback.resolvedOutcome,
            resolverBotId: resolver.agent.id,
            demo: true,
            source: "demo-script"
          });
        }

        await this.pause(300);
        await this.settleResolvedMarkets();

        this.postMessage(
          `[DEMO][MCP] lifecycle market ${lifecycleMarket.marketId} resolved ${finalized.resolvedOutcome}; settlement sweep complete`,
          resolver.agent.id
        );
        this.#eventBus.publish("clawdbot.demo.completed", {
          runId,
          liquidityMarketId: liquidityMarket.marketId,
          lifecycleMarketId: lifecycleMarket.marketId,
          ordersPlaced,
          betsPlaced,
          demo: true,
          source: "demo-script"
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.#lastDemoError = message;
        this.#eventBus.publish("clawdbot.demo.error", {
          runId,
          error: message,
          demo: true,
          source: "demo-script"
        });
      } finally {
        this.#demoScriptActive = false;
        this.#lastDemoCompletedAt = new Date();
      }
    };

    void run();

    return {
      runId,
      status: "started",
      source: "demo-script"
    };
  }

  async start(): Promise<void> {
    if (!this.#enabled || this.#running) {
      return;
    }

    await this.ensureSharedEscrow();
    await this.ensureBotPopulation();
    this.closeExpiredMarketsOnStartup();
    await this.runTick();

    this.#interval = setInterval(() => {
      void this.runTick();
    }, this.#tickMs);
    if (!this.#eventSubscription) {
      this.#eventSubscription = this.#eventBus.subscribe((event) => {
        this.handleEvent(event);
      });
    }
    this.#running = true;
    this.#eventBus.publish("clawdbot.started", this.getStatus());
  }

  async stop(): Promise<void> {
    if (!this.#running) {
      return;
    }

    if (this.#interval) {
      clearInterval(this.#interval);
      this.#interval = null;
    }
    if (this.#eventSubscription) {
      this.#eventSubscription();
      this.#eventSubscription = null;
    }

    this.#running = false;

    await this.reclaimHbar();

    this.#eventBus.publish("clawdbot.stopped", this.getStatus());

    for (const client of this.#clientCache.values()) {
      client.close();
    }

    this.#clientCache.clear();
  }

  async runTick(): Promise<void> {
    if (!this.#enabled || this.#activeTick) {
      return;
    }

    this.#activeTick = true;

    try {
      await this.ensureBotPopulation();

      this.#tickCount += 1;
      const now = new Date();

      if (this.#tickCount % 5 === 0) {
        await this.topUpDrainedWallets();
      }

      await this.runDiscoveryAndBetting(now);
      await this.resolveExpiredMarkets(now);
      await this.settleResolvedMarkets();

      this.#lastTickAt = now;
      this.#lastError = null;
      this.#eventBus.publish("clawdbot.tick", this.getStatus());
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error);
      this.#eventBus.publish("clawdbot.error", {
        error: this.#lastError,
        tickCount: this.#tickCount
      });
    } finally {
      this.#activeTick = false;
    }
  }

  private handleEvent(event: ApiEvent): void {
    if (!this.#running) {
      return;
    }

    if (event.type === "market.challenged") {
      const payload =
        event.payload && typeof event.payload === "object"
          ? (event.payload as { demo?: unknown; source?: unknown })
          : null;
      if (payload?.demo === true || payload?.source === "demo-script") {
        return;
      }

      const challenge = this.parseChallengePayload(event.payload);

      if (!challenge) {
        return;
      }

      void this.broadcastDisputeVotes(challenge.marketId, challenge.proposedOutcome, "market.challenged");
      return;
    }

    if (event.type === "clawdbot.market.challenged") {
      const payload =
        event.payload && typeof event.payload === "object"
          ? (event.payload as { marketId?: unknown; challenge?: unknown; demo?: unknown; source?: unknown })
          : null;
      if (payload?.demo === true || payload?.source === "demo-script") {
        return;
      }
      const challenge = this.parseChallengePayload(payload?.challenge);
      const marketId = parseNonEmptyString(payload?.marketId, challenge?.marketId ?? "");

      if (!marketId) {
        return;
      }

      void this.broadcastDisputeVotes(marketId, challenge?.proposedOutcome, "clawdbot.market.challenged");
    }
  }

  private parseChallengePayload(
    payload: unknown
  ): { marketId: string; proposedOutcome: string | undefined } | null {
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const challenge = payload as { marketId?: unknown; proposedOutcome?: unknown };
    const marketId = parseNonEmptyString(challenge.marketId, "");

    if (!marketId) {
      return null;
    }

    const proposedOutcome = parseNonEmptyString(challenge.proposedOutcome, "");
    return {
      marketId,
      proposedOutcome: proposedOutcome || undefined
    };
  }

  private isIneligibleOracleVoter(
    market:
      | {
          creatorAccountId: string;
          selfAttestation?: { attestedByAccountId: string };
          challenges?: Array<{ challengerAccountId: string }>;
        }
      | undefined,
    accountId: string
  ): boolean {
    if (!market) {
      return false;
    }

    const normalized = accountId.trim();

    if (!normalized) {
      return true;
    }
    if (market.creatorAccountId.trim() === normalized) {
      return true;
    }
    if (market.selfAttestation?.attestedByAccountId.trim() === normalized) {
      return true;
    }

    return (market.challenges ?? []).some(
      (challenge) => challenge.challengerAccountId.trim() === normalized
    );
  }

  private async broadcastDisputeVotes(
    marketId: string,
    preferredOutcome: string | undefined,
    source: "market.challenged" | "clawdbot.market.challenged"
  ): Promise<void> {
    if (!this.#running || this.#activeDisputeBroadcasts.has(marketId)) {
      return;
    }

    this.#activeDisputeBroadcasts.add(marketId);

    try {
      await this.ensureBotPopulation();
      const store = getMarketStore();
      const market = store.markets.get(marketId);

      if (!market || market.status === "RESOLVED" || !market.selfAttestation) {
        return;
      }

      const reputationByAccount = this.buildReputationMap();
      const candidates = Array.from(this.#runtimeBots.values()).filter((runtime) => {
        if (this.isIneligibleOracleVoter(market, runtime.wallet.accountId)) {
          return false;
        }

        const control = this.#hostedControl.get(runtime.agent.id);
        if (!control) {
          return true;
        }

        return control.active && !control.suspended;
      });
      const targetVotes = candidates.length;

      this.#eventBus.publish("clawdbot.market.dispute_broadcast", {
        marketId,
        source,
        targetVotes
      });

      for (const runtime of candidates) {
        const snapshot = getMarketStore().markets.get(marketId);

        if (!snapshot || snapshot.status === "RESOLVED" || !snapshot.selfAttestation) {
          break;
        }

        const alreadyVoted = (snapshot.oracleVotes ?? []).some(
          (vote) => vote.voterAccountId.trim() === runtime.wallet.accountId
        );

        if (alreadyVoted) {
          continue;
        }

        const bettorBets = (getMarketStore().bets.get(marketId) ?? []).filter(
          (bet) => bet.bettorAccountId === runtime.wallet.accountId
        );
        const ownTotals: Record<string, number> = {};

        for (const bet of bettorBets) {
          ownTotals[bet.outcome] = (ownTotals[bet.outcome] ?? 0) + bet.amountHbar;
        }

        const voteOutcome =
          Object.entries(ownTotals).sort((left, right) => right[1] - left[1])[0]?.[0] ??
          preferredOutcome ??
          snapshot.selfAttestation.proposedOutcome ??
          snapshot.outcomes[0] ??
          "YES";
        const reputationScore = reputationByAccount[runtime.wallet.accountId] ?? runtime.agent.reputationScore;
        const confidence = clamp(0.4 + reputationScore / 200, 0.3, 0.95);

        let vote: Awaited<ReturnType<typeof submitOracleVote>>;
        try {
          vote = await submitOracleVote(
            {
              marketId,
              voterAccountId: runtime.wallet.accountId,
              outcome: voteOutcome,
              confidence,
              reason: `Community dispute vote broadcast from ${source}`,
              reputationScore
            },
            {
              client: this.getClient(runtime.wallet),
              oracleMinVotes: this.#oracleMinVoters,
              oracleEligibleVoterCount: candidates.length,
              oracleQuorumPercent: this.#oracleQuorumPercent,
              reputationLookup: (accountId) => reputationByAccount[accountId] ?? 0
            }
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);

          if (/already submitted an oracle vote/i.test(message)) {
            continue;
          }
          if (/already resolved/i.test(message)) {
            break;
          }

          this.#eventBus.publish("clawdbot.market.oracle_vote_error", {
            marketId,
            botId: runtime.agent.id,
            source: "dispute-broadcast",
            error: message
          });
          continue;
        }

        this.#eventBus.publish("clawdbot.market.oracle_vote", {
          marketId,
          vote: vote.vote,
          botId: runtime.agent.id,
          source: "dispute-broadcast"
        });

        if (!vote.finalized) {
          continue;
        }

        const finalVotes = (getMarketStore().markets.get(marketId)?.oracleVotes ?? []) as Array<{
          id: string;
          voterAccountId: string;
          outcome: string;
          confidence: number;
        }>;
        const uniqueVotes = Array.from(
          finalVotes.reduce((map, entry) => {
            map.set(entry.voterAccountId.trim(), entry);
            return map;
          }, new Map<string, (typeof finalVotes)[number]>()).values()
        );

        await this.applyOracleVoteReputation(marketId, vote.finalized.resolvedOutcome, uniqueVotes, {
          attesterAccountId: vote.finalized.resolvedByAccountId
        });
        await this.applySelfAttestationReputation(
          marketId,
          vote.finalized.resolvedOutcome,
          getMarketStore().markets.get(marketId)?.selfAttestation,
          { attesterAccountId: vote.finalized.resolvedByAccountId }
        );
        this.#eventBus.publish("clawdbot.market.resolved", {
          marketId,
          resolvedOutcome: vote.finalized.resolvedOutcome,
          resolverBotId: runtime.agent.id,
          source: "dispute-broadcast"
        });
        break;
      }
    } catch (error) {
      this.#eventBus.publish("clawdbot.market.dispute_broadcast_error", {
        marketId,
        source,
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      this.#activeDisputeBroadcasts.delete(marketId);
    }
  }

  async createEventMarket(input: CreateClawdbotEventMarketInput): Promise<{ marketId: string }> {
    if (!this.#enabled) {
      throw new Error("Clawdbot network is disabled.");
    }

    await this.ensureBotPopulation();

    const bots = Array.from(this.#runtimeBots.values());

    if (bots.length === 0) {
      throw new Error("No ClawDBots are available.");
    }

    const creator = input.creatorBotId
      ? this.#runtimeBots.get(input.creatorBotId)
      : bots[Math.floor(Math.random() * bots.length)];

    if (!creator) {
      throw new Error("Unable to resolve creator bot.");
    }

    const prompt = parseNonEmptyString(
      input.prompt,
      ""
    );

    if (!prompt) {
      throw new Error("Market prompt is required — no scripted fallback available.");
    }
    const outcomes = parseOutcomes(input.outcomes);
    const resolvedOutcomes = outcomes ?? ["YES", "NO"];
    const initialOddsByOutcome =
      parseInitialOddsByOutcome(input.initialOddsByOutcome, resolvedOutcomes) ??
      defaultInitialOddsByOutcome(resolvedOutcomes, creator.agent.strategy.name);
    const closeMinutes = Math.max(5, Math.round(parsePositiveNumber(input.closeMinutes, this.#marketCloseMinutes)));
    const lowLiquidity = input.lowLiquidity ?? (input.liquidityModel === "WEIGHTED_CURVE" || input.liquidityModel === "LOW_LIQUIDITY");
    const liquidityModel = lowLiquidity ? "LOW_LIQUIDITY" : "HIGH_LIQUIDITY";
    const curveLiquidityHbar =
      typeof input.curveLiquidityHbar === "number" && Number.isFinite(input.curveLiquidityHbar) && input.curveLiquidityHbar > 0
        ? input.curveLiquidityHbar
        : undefined;

    const marketResult = await creator.adapter.handleToolCall({
      name: "create_market",
      args: {
        question: prompt,
        outcomes,
        initialOddsByOutcome,
        closeMinutes,
        lowLiquidity,
        liquidityModel,
        curveLiquidityHbar
      }
    });

    const marketId =
      typeof marketResult === "object" && marketResult && "marketId" in marketResult
        ? parseNonEmptyString((marketResult as { marketId?: unknown }).marketId, "")
        : "";

    if (!marketId) {
      throw new Error("Failed to create event market.");
    }

    this.#eventBus.publish("clawdbot.market.created", {
      marketId,
      creatorBotId: creator.agent.id,
      creatorAccountId: creator.wallet.accountId,
      prompt,
      demo: prompt.startsWith("[DEMO]"),
      source: prompt.startsWith("[DEMO]") ? "demo-script" : undefined
    });

    return { marketId };
  }

  private pause(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private async ensureBotPopulation(): Promise<void> {
    if (!this.#enabled) {
      return;
    }

    const persisted = this.#walletStore.get();

    if (this.#runtimeBots.size === 0 && persisted.wallets.length > 0) {
      const repStore = getReputationStore();

      let operatorHbar = Infinity;
      try {
        const opBal = await getBalance(this.#operatorAccountId, {
          client: this.getOperatorClient()
        });
        operatorHbar = opBal.hbar;
        console.log(`[clawdbot] Operator ${this.#operatorAccountId} balance: ${operatorHbar.toFixed(2)} HBAR`);
      } catch (error) {
        console.warn(
          `[clawdbot] Could not query operator balance: ${error instanceof Error ? error.message : error}`
        );
      }

      for (let index = 0; index < persisted.wallets.length && this.#runtimeBots.size < this.#targetBots; index += 1) {
        const wallet = persisted.wallets[index]!;
        const sequence = index + 1;
        const strategy = this.strategyForIndex(sequence);

        const agentWallet: AgentWallet = {
          accountId: wallet.accountId,
          privateKey: wallet.privateKey,
          privateKeyType: wallet.privateKeyType
        };

        let actualBalance = this.#initialBotBalanceHbar;
        try {
          const balance = await getBalance(wallet.accountId, {
            client: this.getClient(agentWallet)
          });
          actualBalance = balance.hbar;

          const minBalance = this.#initialBotBalanceHbar * 0.25;
          if (balance.hbar < minBalance) {
            const topUp = this.#initialBotBalanceHbar - balance.hbar;

            if (operatorHbar < topUp + 5) {
              console.warn(
                `[clawdbot] Skipping top-up for ${wallet.accountId}: operator balance too low (${operatorHbar.toFixed(2)} HBAR, need ${topUp.toFixed(2)}).`
              );
            } else {
              let funded = false;
              for (let attempt = 0; attempt < 3 && !funded; attempt += 1) {
                try {
                  if (attempt > 0) {
                    await new Promise((r) => setTimeout(r, 1500 * attempt));
                  }
                  await transferHbar(this.#operatorAccountId, wallet.accountId, topUp, {
                    client: this.getOperatorClient()
                  });
                  operatorHbar -= topUp;
                  actualBalance = balance.hbar + topUp;
                  funded = true;
                  console.log(
                    `[clawdbot] Topped up ${wallet.accountId} with ${topUp.toFixed(2)} HBAR (was ${balance.hbar.toFixed(2)}).`
                  );
                } catch (retryErr) {
                  if (attempt === 2) {
                    console.warn(
                      `[clawdbot] Top-up failed for ${wallet.accountId} after 3 attempts: ${retryErr instanceof Error ? retryErr.message : retryErr}`
                    );
                  }
                }
              }
            }
          }
        } catch (error) {
          console.warn(
            `[clawdbot] Could not check balance for ${wallet.accountId}: ${error instanceof Error ? error.message : error}`
          );
        }

        const restoredRep = calculateReputationScore(wallet.accountId, repStore.attestations);

        const agent = new BaseAgent(
          {
            id: randomUUID(),
            name: `ClawDBot-${sequence}`,
            accountId: wallet.accountId,
            bankrollHbar: Math.max(1, Math.round(actualBalance)),
            reputationScore: restoredRep.score
          },
          strategy
        );

        const runtime: RuntimeBot = {
          agent,
          wallet: agentWallet,
          adapter: this.createAdapter(agent, agentWallet),
          origin: "internal",
          joinedAt: new Date().toISOString(),
          llm: this.#llmConfig,
          hosted: false
        };

        this.#runtimeBots.set(agent.id, runtime);
        this.#registry.add(agent);
        this.#eventBus.publish("clawdbot.restored", {
          botId: agent.id,
          accountId: agent.accountId,
          strategy: strategy.name
        });
      }
    }

    while (this.#runtimeBots.size < this.#targetBots) {
      const sequence = this.#runtimeBots.size + 1;
      const created = await createAccount(this.#initialBotBalanceHbar, {
        client: this.getOperatorClient(),
        keyStore: this.#keyStore
      });
      const strategy = this.strategyForIndex(sequence);

      const agent = new BaseAgent(
        {
          id: randomUUID(),
          name: `ClawDBot-${sequence}`,
          accountId: created.accountId,
          bankrollHbar: this.#initialBotBalanceHbar,
          reputationScore: 50
        },
        strategy
      );
      const wallet: AgentWallet = {
        accountId: created.accountId,
        privateKey: created.privateKey,
        privateKeyType: "der"
      };

      const runtime: RuntimeBot = {
        agent,
        wallet,
        adapter: this.createAdapter(agent, wallet),
        origin: "internal",
        joinedAt: new Date().toISOString(),
        llm: this.#llmConfig,
        hosted: false
      };

      this.#runtimeBots.set(agent.id, runtime);
      this.#registry.add(agent);

      persisted.wallets.push(wallet);
      this.#walletStore.persist(persisted);
      this.#eventBus.publish("clawdbot.spawned", {
        botId: agent.id,
        accountId: agent.accountId,
        strategy: strategy.name
      });
    }
  }

  private strategyForIndex(index: number): AgentStrategy {
    const strategies: AgentStrategy[] = [
      createRandomStrategy(),
      createReputationBasedStrategy(),
      createContrarianStrategy()
    ];

    return strategies[(index - 1) % strategies.length] ?? createRandomStrategy();
  }

  private strategyForName(name: ClawdbotStrategyName | undefined): AgentStrategy {
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

  private getBot(botId: string): RuntimeBot {
    const runtime = this.#runtimeBots.get(botId);

    if (!runtime) {
      throw new Error(`ClawDBot ${botId} was not found.`);
    }

    return runtime;
  }

  private requireHostedControl(botId: string): HostedBotControl {
    const control = this.#hostedControl.get(botId);

    if (!control) {
      throw new Error(`Bot ${botId} is not registered as a hosted bot.`);
    }

    return control;
  }

  private toHostedStatus(control: HostedBotControl): HostedBotStatus {
    return {
      botId: control.botId,
      ownerId: control.ownerId,
      active: control.active,
      suspended: control.suspended,
      hosted: control.hosted,
      createdAt: control.createdAt,
      updatedAt: control.updatedAt,
      lastActionAt: control.lastActionAt,
      actionsInCurrentWindow: control.actionsInWindow
    };
  }

  private canExecuteHostedAction(botId: string): boolean {
    const control = this.#hostedControl.get(botId);

    if (!control) {
      return true;
    }

    if (!control.active || control.suspended) {
      return false;
    }

    const now = Date.now();

    if (control.lastActionAt) {
      const lastMs = Date.parse(control.lastActionAt);

      if (Number.isFinite(lastMs) && now - lastMs < this.#minActionIntervalMs) {
        return false;
      }
    }

    if (now - control.windowStartedAt >= 60_000) {
      control.windowStartedAt = now;
      control.actionsInWindow = 0;
    }

    if (control.actionsInWindow >= this.#maxActionsPerMinute) {
      return false;
    }

    return true;
  }

  private recordHostedAction(botId: string): void {
    const control = this.#hostedControl.get(botId);

    if (!control) {
      return;
    }

    const now = Date.now();

    if (now - control.windowStartedAt >= 60_000) {
      control.windowStartedAt = now;
      control.actionsInWindow = 0;
    }

    control.actionsInWindow += 1;
    control.lastActionAt = new Date(now).toISOString();
    control.updatedAt = control.lastActionAt;
  }

  private toBotProfile(runtime: RuntimeBot, reputationScore?: number): ClawdbotProfile {
    const control = this.#hostedControl.get(runtime.agent.id);
    return {
      id: runtime.agent.id,
      name: runtime.agent.name,
      accountId: runtime.wallet.accountId,
      strategy: runtime.agent.strategy.name,
      mode: runtime.agent.mode,
      bankrollHbar: runtime.agent.bankrollHbar,
      reputationScore: reputationScore ?? runtime.agent.reputationScore,
      origin: runtime.origin,
      joinedAt: runtime.joinedAt,
      hosted: runtime.hosted ?? Boolean(control),
      active: control ? control.active : true,
      suspended: control ? control.suspended : false
    };
  }

  private createAdapter(agent: BaseAgent, wallet: AgentWallet): OpenClawAdapter {
    return createOpenClawAdapter(agent, {
      createMarket: async (args) => {
        const question = parseNonEmptyString(args.question, "");

        if (!question) {
          throw new Error("Market question is required — no scripted fallback available.");
        }
        const outcomes = parseOutcomes(args.outcomes);
        const resolvedOutcomes = outcomes ?? ["YES", "NO"];
        const initialOddsByOutcome =
          parseInitialOddsByOutcome(args.initialOddsByOutcome, resolvedOutcomes) ??
          defaultInitialOddsByOutcome(resolvedOutcomes, agent.strategy.name);
        const closeMinutes = Math.max(5, Math.round(parsePositiveNumber(args.closeMinutes, this.#marketCloseMinutes)));
        const lowLiquidity = args.lowLiquidity === true || parseNonEmptyString(args.liquidityModel, "") === "WEIGHTED_CURVE" || parseNonEmptyString(args.liquidityModel, "") === "LOW_LIQUIDITY";
        const liquidityModel = lowLiquidity ? "LOW_LIQUIDITY" : "HIGH_LIQUIDITY";
        const curveLiquidityHbar =
          typeof args.curveLiquidityHbar === "number" &&
          Number.isFinite(args.curveLiquidityHbar) &&
          args.curveLiquidityHbar > 0
            ? args.curveLiquidityHbar
            : undefined;
        const closeTime = new Date(Date.now() + closeMinutes * 60 * 1000).toISOString();

        const escrowAccountId = this.#escrowWallet?.accountId ?? wallet.accountId;
        const created = await createMarket(
          {
            question,
            description: `Created by ${agent.name}`,
            creatorAccountId: wallet.accountId,
            escrowAccountId,
            closeTime,
            outcomes,
            initialOddsByOutcome,
            lowLiquidity,
            liquidityModel,
            curveLiquidityHbar
          },
          { client: this.getClient(wallet) }
        );

        return { marketId: created.market.id };
      },
      fetchMarkets: async () => {
        const store = getMarketStore();
        const markets = Array.from(store.markets.values()).filter((market) => market.status === "OPEN");

        return markets.map(toMarketSnapshot);
      },
      publishOrder: async (args) => {
        const marketId = parseNonEmptyString(args.marketId, "");
        const outcome = parseNonEmptyString(args.outcome, "YES");
        const side = parseNonEmptyString(args.side, "BID") === "ASK" ? "ASK" : "BID";
        const quantity = clamp(parsePositiveNumber(args.quantity, 10), 1, 100);
        const price = clamp(parsePositiveNumber(args.price, 0.6), 0.01, 0.99);

        if (!marketId) {
          throw new Error("marketId is required.");
        }

        const order = await publishOrder(
          {
            marketId,
            accountId: wallet.accountId,
            outcome,
            side,
            quantity,
            price
          },
          { client: this.getClient(wallet) }
        );

        return {
          orderId: order.id
        };
      },
      placeBet: async (args) => {
        const marketId = parseNonEmptyString(args.marketId, "");
        const outcome = parseNonEmptyString(args.outcome, "YES");
        const amountHbar = clamp(parsePositiveNumber(args.amountHbar, this.#minBetHbar), this.#minBetHbar, this.#maxBetHbar);

        if (!marketId) {
          throw new Error("marketId is required.");
        }

        const bet = await placeBet(
          {
            marketId,
            bettorAccountId: wallet.accountId,
            outcome,
            amountHbar
          },
          { client: this.getClient(wallet) }
        );

        return { betId: bet.id };
      },
      resolveMarket: async (args) => {
        const marketId = parseNonEmptyString(args.marketId, "");

        if (!marketId) {
          throw new Error("marketId is required.");
        }

        const resolvedOutcome = parseNonEmptyString(args.resolvedOutcome, "YES");
        const reason = parseNonEmptyString(args.reason, "ClawDBot autonomous resolution");
        const resolution = await resolveMarket(
          {
            marketId,
            resolvedOutcome,
            resolvedByAccountId: wallet.accountId,
            reason
          },
          { client: this.getClient(wallet) }
        );

        return {
          marketId: resolution.marketId,
          resolvedOutcome: resolution.resolvedOutcome
        };
      },
      selfAttest: async (args) => {
        const marketId = parseNonEmptyString(args.marketId, "");
        if (!marketId) throw new Error("marketId is required.");
        const proposedOutcome = parseNonEmptyString(args.proposedOutcome, "YES");
        const reason = parseNonEmptyString(args.reason, "ClawDBot self-attestation");
        const evidence = parseNonEmptyString(args.evidence, "");
        const challengeWindowMinutes = parsePositiveNumber(args.challengeWindowMinutes, 30);

        const result = await selfAttestMarket(
          {
            marketId,
            proposedOutcome,
            reason: reason || undefined,
            evidence: evidence || undefined,
            challengeWindowMinutes,
            attestedByAccountId: wallet.accountId
          },
          { client: this.getClient(wallet) }
        );
        return result;
      },
      challengeResolution: async (args) => {
        const marketId = parseNonEmptyString(args.marketId, "");
        if (!marketId) throw new Error("marketId is required.");
        const proposedOutcome = parseNonEmptyString(args.proposedOutcome, "YES");
        const reason = parseNonEmptyString(args.reason, "ClawDBot challenge");
        const evidence = parseNonEmptyString(args.evidence, "");

        const result = await challengeMarketResolution(
          {
            marketId,
            proposedOutcome,
            reason,
            evidence: evidence || undefined,
            challengerAccountId: wallet.accountId
          },
          { client: this.getClient(wallet) }
        );
        return result;
      },
      oracleVote: async (args) => {
        const marketId = parseNonEmptyString(args.marketId, "");
        if (!marketId) throw new Error("marketId is required.");
        const outcome = parseNonEmptyString(args.outcome, "YES");
        const confidence = typeof args.confidence === "number" ? clamp(args.confidence, 0, 1) : undefined;
        const reason = parseNonEmptyString(args.reason, "");

        const result = await submitOracleVote(
          {
            marketId,
            outcome,
            confidence,
            reason: reason || undefined,
            voterAccountId: wallet.accountId
          },
          { client: this.getClient(wallet) }
        );
        return result;
      },
      claimWinnings: async (args) => {
        const marketId = parseNonEmptyString(args.marketId, "");
        if (!marketId) throw new Error("marketId is required.");
        const payoutAccountId = parseNonEmptyString(args.payoutAccountId, "");

        // The escrow account (creator's wallet) must sign the payout transfer, not the winner's wallet.
        const store = getMarketStore();
        const market = store.markets.get(marketId);
        const escrowClient =
          (market ? this.clientForAccount(market.escrowAccountId) : null) ??
          this.getOperatorClient();

        const claim = await claimWinnings(
          {
            marketId,
            accountId: wallet.accountId,
            payoutAccountId: payoutAccountId || undefined
          },
          { client: escrowClient }
        );
        return { claimId: claim.id };
      }
    });
  }

  private buildReputationMap(): Record<string, number> {
    const map: Record<string, number> = {};
    const store = getReputationStore();

    for (const runtime of this.#runtimeBots.values()) {
      const computed = calculateReputationScore(runtime.wallet.accountId, store.attestations);

      if (computed.attestationCount > 0) {
        map[runtime.wallet.accountId] = computed.score;

        const drift = computed.score - runtime.agent.reputationScore;
        if (Math.abs(drift) > 0.5) {
          runtime.agent.adjustReputation(drift);
        }
      } else {
        map[runtime.wallet.accountId] = runtime.agent.reputationScore;
      }
    }

    return map;
  }

  private buildMarketSentiment(): Record<string, MarketSentiment> {
    const sentiment: Record<string, MarketSentiment> = {};
    const store = getMarketStore();

    for (const [marketId, bets] of store.bets.entries()) {
      const totals: Record<string, number> = {};
      let sum = 0;

      for (const bet of bets) {
        totals[bet.outcome] = (totals[bet.outcome] ?? 0) + bet.amountHbar;
        sum += bet.amountHbar;
      }

      if (sum > 0) {
        sentiment[marketId] = Object.fromEntries(
          Object.entries(totals).map(([outcome, value]) => [outcome, value / sum])
        );
      } else {
        sentiment[marketId] = totals;
      }
    }

    return sentiment;
  }

  private async runDiscoveryAndBetting(now: Date): Promise<void> {
    const reputationByAccount = this.buildReputationMap();
    const marketSentiment = this.buildMarketSentiment();

    for (const runtime of this.#runtimeBots.values()) {
      if (!this.canExecuteHostedAction(runtime.agent.id)) {
        continue;
      }

      const failures = this.#consecutiveFailures.get(runtime.agent.id) ?? 0;
      if (failures >= 5) {
        const skipTicks = Math.min(Math.floor(failures / 2), 5);
        if (this.#tickCount % skipTicks !== 0) {
          continue;
        }
      }

      const fetched = await runtime.adapter.handleToolCall({
        name: "fetch_markets",
        args: {}
      });
      const markets = (Array.isArray(fetched) ? fetched : []) as MarketSnapshot[];
      const previousGoal = this.#goalsByBotId.get(runtime.agent.id);
      const lastFailure = previousGoal?.status === "FAILED" ? previousGoal : undefined;
      const goal = await this.ensureGoal(runtime, markets, reputationByAccount, marketSentiment, lastFailure);
      const action = await this.cognitionFor(runtime).decideAction({
        goal,
        bot: runtime.agent,
        markets,
        reputationByAccount,
        marketSentiment,
        lastFailedGoal: lastFailure
      });

      this.#eventBus.publish("clawdbot.goal.updated", {
        botId: runtime.agent.id,
        goalId: goal.id,
        status: "IN_PROGRESS",
        actionType: action.type,
        demo: false
      });

      try {
        await this.executePlannedAction(runtime, action, markets, now, reputationByAccount, marketSentiment);
        if (action.type !== "WAIT") {
          this.recordHostedAction(runtime.agent.id);
          if (action.rationale) {
            this.postMessage(action.rationale, runtime.agent.id);
          }
        }
        const completedAt = new Date().toISOString();
        const completed: ClawdbotGoal = {
          ...goal,
          status: "COMPLETED",
          updatedAt: completedAt,
          completedAt
        };
        this.#goalsByBotId.set(runtime.agent.id, completed);
        this.#consecutiveFailures.delete(runtime.agent.id);
        this.#eventBus.publish("clawdbot.goal.completed", {
          botId: runtime.agent.id,
          goal: completed,
          actionType: action.type
        });
      } catch (error) {
        const parts: string[] = [];
        let current: unknown = error;
        while (current instanceof Error) {
          parts.push(current.message);
          current = current.cause;
        }
        if (current !== undefined && current !== null && !(current instanceof Error)) {
          parts.push(String(current));
        }
        const message = parts.join(" → ");
        console.error(`[clawdbot] Goal failed for ${runtime.agent.name}: ${message}`);
        const failedAt = new Date().toISOString();
        const failed: ClawdbotGoal = {
          ...goal,
          status: "FAILED",
          updatedAt: failedAt,
          error: error instanceof Error ? error.message : String(error)
        };
        this.#goalsByBotId.set(runtime.agent.id, failed);
        this.#consecutiveFailures.set(runtime.agent.id, (this.#consecutiveFailures.get(runtime.agent.id) ?? 0) + 1);
        this.#eventBus.publish("clawdbot.goal.failed", {
          botId: runtime.agent.id,
          goal: failed
        });
      }
    }
  }

  private cognitionFor(runtime: RuntimeBot): LlmCognitionEngine {
    const storedCredentials = runtime.hosted ? this.#credentialStore.load(runtime.agent.id) : null;
    const llm = storedCredentials?.llm ?? runtime.llm;

    if (!llm) {
      return this.#cognition;
    }

    if (
      llm.apiKey === this.#llmConfig.apiKey &&
      llm.model === this.#llmConfig.model &&
      llm.baseUrl === this.#llmConfig.baseUrl
    ) {
      return this.#cognition;
    }

    return new LlmCognitionEngine({
      ...this.#llmConfig,
      ...llm
    });
  }

  private async ensureGoal(
    runtime: RuntimeBot,
    markets: MarketSnapshot[],
    reputationByAccount?: Record<string, number>,
    marketSentiment?: MarketSentimentMap,
    lastFailedGoal?: ClawdbotGoal
  ): Promise<ClawdbotGoal> {
    const existing = this.#goalsByBotId.get(runtime.agent.id);

    if (existing && (existing.status === "PENDING" || existing.status === "IN_PROGRESS")) {
      return existing;
    }

    const created = await this.cognitionFor(runtime).generateGoal({
      bot: runtime.agent,
      markets,
      reputationByAccount,
      marketSentiment,
      lastFailedGoal
    });
    const inProgress: ClawdbotGoal = {
      ...created,
      status: "IN_PROGRESS",
      updatedAt: new Date().toISOString()
    };
    this.#goalsByBotId.set(runtime.agent.id, inProgress);

    if (created.title && created.title !== "Waiting for LLM") {
      this.postMessage(created.title, runtime.agent.id);
    }

    this.#eventBus.publish("clawdbot.goal.created", {
      botId: runtime.agent.id,
      goal: inProgress
    });

    return inProgress;
  }

  private async executePlannedAction(
    runtime: RuntimeBot,
    action: ClawdbotPlannedAction,
    markets: MarketSnapshot[],
    now: Date,
    reputationByAccount: Record<string, number>,
    marketSentiment: Record<string, MarketSentiment>
  ): Promise<void> {
    const openMarkets = markets.filter((market) => market.status === "OPEN");
    const fallbackMarket = openMarkets[0];

    switch (action.type) {
      case "CREATE_MARKET": {
        await this.createMarketAsBot(runtime.agent.id, {
          prompt:
            parseNonEmptyString(action.prompt, "") ||
            `[GOAL] ${runtime.agent.name} is probing community demand around a new objective.`,
          outcomes: ["YES", "NO"],
          initialOddsByOutcome: action.initialOddsByOutcome,
          closeMinutes: this.#marketCloseMinutes
        });
        return;
      }
      case "PUBLISH_ORDER": {
        const marketId = parseNonEmptyString(action.marketId, fallbackMarket?.id ?? "");

        if (!marketId) {
          return;
        }

        const targetMarket = openMarkets.find((market) => market.id === marketId) ?? fallbackMarket;
        const outcome = parseNonEmptyString(action.outcome, targetMarket?.outcomes[0] ?? "YES");
        const side = action.side === "ASK" ? "ASK" : "BID";
        const quantity = clamp(action.quantity ?? 10, 1, 100);
        const price = clamp(action.price ?? 0.6, 0.01, 0.99);
        const order = await publishOrder(
          {
            marketId,
            accountId: runtime.wallet.accountId,
            outcome,
            side,
            quantity,
            price
          },
          { client: this.getClient(runtime.wallet) }
        );

        this.#eventBus.publish("market.order", {
          ...order,
          botId: runtime.agent.id,
          rationale: action.rationale
        });

        const isOwnMarket = targetMarket?.creatorAccountId === runtime.wallet.accountId;
        const existingBets = getMarketStore().bets.get(marketId) ?? [];
        const alreadyStaked = existingBets.some((bet) => bet.bettorAccountId === runtime.wallet.accountId);
        const bootstrapStake = Math.min(this.#maxBetHbar, this.#minBetHbar);

        if (!isOwnMarket && !alreadyStaked && bootstrapStake > 0 && runtime.agent.bankrollHbar >= bootstrapStake) {
          try {
            await runtime.adapter.handleToolCall({
              name: "place_bet",
              args: {
                marketId,
                outcome,
                amountHbar: bootstrapStake
              }
            });
            runtime.agent.adjustBankroll(-bootstrapStake);
            runtime.agent.adjustReputation(0.75);
            this.#eventBus.publish("clawdbot.bet.placed", {
              botId: runtime.agent.id,
              marketId,
              outcome,
              amountHbar: bootstrapStake,
              rationale: "Bootstrap stake paired with posted orderbook liquidity."
            });
          } catch (error) {
            this.#eventBus.publish("clawdbot.bet.error", {
              botId: runtime.agent.id,
              marketId,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
        return;
      }
      case "PLACE_BET": {
        const eligibleMarkets = openMarkets.filter(
          (entry) => entry.creatorAccountId !== runtime.wallet.accountId
        );
        const market =
          eligibleMarkets.find((entry) => entry.id === action.marketId) ??
          eligibleMarkets[0] ??
          null;

        if (!market) {
          return;
        }

        const reserveHbar = 2;
        if (runtime.agent.bankrollHbar <= reserveHbar + this.#minBetHbar) {
          return;
        }

        const hadStakeBefore = (getMarketStore().bets.get(market.id) ?? []).some(
          (bet) => bet.bettorAccountId === runtime.wallet.accountId
        );

        const decision =
          action.outcome && action.amountHbar
            ? {
                outcome: action.outcome,
                amountHbar: action.amountHbar,
                rationale: action.rationale
              }
            : await runtime.agent.decideBet(market, {
                now,
                reputationByAccount,
                marketSentiment
              });

        if (!decision) {
          return;
        }

        const maxAffordable = Math.max(0, runtime.agent.bankrollHbar - reserveHbar);
        const amountHbar = clamp(decision.amountHbar, this.#minBetHbar, Math.min(this.#maxBetHbar, maxAffordable));

        if (amountHbar <= 0) {
          return;
        }

        await runtime.adapter.handleToolCall({
          name: "place_bet",
          args: {
            marketId: market.id,
            outcome: decision.outcome,
            amountHbar
          }
        });
        runtime.agent.adjustBankroll(-amountHbar);
        if (!hadStakeBefore) {
          runtime.agent.adjustReputation(0.75);
        }
        this.#eventBus.publish("clawdbot.bet.placed", {
          botId: runtime.agent.id,
          marketId: market.id,
          outcome: decision.outcome,
          amountHbar,
          rationale: decision.rationale
        });
        return;
      }
      case "RESOLVE_MARKET": {
        const marketId = parseNonEmptyString(action.marketId, "");

        if (!marketId) {
          return;
        }

        await this.resolveMarketAsBot(runtime.agent.id, {
          marketId,
          resolvedOutcome: parseNonEmptyString(action.resolvedOutcome, "YES"),
          reason: parseNonEmptyString(action.reason, "LLM-driven goal completion")
        });
        return;
      }
      case "WAIT":
      default:
        return;
    }
  }

  private async topUpDrainedWallets(): Promise<void> {
    const internalMinBalance = this.#initialBotBalanceHbar * 0.25;
    const communityMinBalance = this.#communityRefillThresholdHbar;

    let operatorHbar = Infinity;
    try {
      const opBal = await getBalance(this.#operatorAccountId, {
        client: this.getOperatorClient()
      });
      operatorHbar = opBal.hbar;
    } catch {
      // If we can't check operator balance, proceed cautiously
    }

    for (const runtime of this.#runtimeBots.values()) {
      const isCommunity = runtime.origin === "community";
      const threshold = isCommunity ? communityMinBalance : internalMinBalance;

      try {
        const balance = await getBalance(runtime.wallet.accountId, {
          client: this.getClient(runtime.wallet)
        });

        if (balance.hbar < threshold) {
          const target = isCommunity ? this.#communityFundingHbar : this.#initialBotBalanceHbar;
          const topUp = target - balance.hbar;

          if (operatorHbar < topUp + 5) {
            console.warn(
              `[clawdbot] Skipping periodic top-up for ${runtime.agent.name}: operator balance too low (${operatorHbar.toFixed(2)} HBAR).`
            );
            continue;
          }

          await transferHbar(this.#operatorAccountId, runtime.wallet.accountId, topUp, {
            client: this.getOperatorClient()
          });
          operatorHbar -= topUp;
          runtime.agent.adjustBankroll(topUp);
          console.log(
            `[clawdbot] Topped up ${runtime.agent.name} (${runtime.wallet.accountId}) with ${topUp.toFixed(2)} HBAR (was ${balance.hbar.toFixed(2)}).`
          );
          this.#eventBus.publish("clawdbot.funded", {
            botId: runtime.agent.id,
            botName: runtime.agent.name,
            accountId: runtime.wallet.accountId,
            amountHbar: topUp,
            previousBalanceHbar: balance.hbar,
            origin: runtime.origin
          });
        } else {
          runtime.agent.adjustBankroll(balance.hbar - runtime.agent.bankrollHbar);
        }
      } catch (error) {
        console.warn(
          `[clawdbot] Top-up sweep failed for ${runtime.agent.name} (${runtime.wallet.accountId}): ${error instanceof Error ? error.message : error}`
        );
      }
    }

    if (this.#escrowWallet) {
      try {
        const escrowBalance = await getBalance(this.#escrowWallet.accountId, {
          client: this.getClient(this.#escrowWallet)
        });
        if (escrowBalance.hbar < 2) {
          const topUp = 10;
          await transferHbar(this.#operatorAccountId, this.#escrowWallet.accountId, topUp, {
            client: this.getOperatorClient()
          });
          console.log(
            `[clawdbot] Topped up escrow ${this.#escrowWallet.accountId} with ${topUp} HBAR (was ${escrowBalance.hbar.toFixed(2)}).`
          );
        }
      } catch {
        // Best-effort
      }
    }
  }

  private closeExpiredMarketsOnStartup(): void {
    const store = getMarketStore();
    const now = Date.now();
    let closed = 0;

    for (const market of store.markets.values()) {
      if (market.status === "OPEN" && Date.parse(market.closeTime) <= now) {
        market.status = "CLOSED";
        closed += 1;
      }
    }

    if (closed > 0) {
      persistMarketStore(store);
      console.log(`[clawdbot] Startup: closed ${closed} expired market(s).`);
    }
  }

  private async resolveExpiredMarkets(now: Date): Promise<void> {
    const store = getMarketStore();
    const reputationByAccount = this.buildReputationMap();
    const candidates = Array.from(store.markets.values()).filter(
      (market) =>
        (market.status === "OPEN" || market.status === "DISPUTED") &&
        Date.parse(market.closeTime) <= now.getTime()
    );

    for (const market of candidates) {
      const bets = store.bets.get(market.id) ?? [];
      const {
        resolvedOutcome,
        resolver,
        confidence,
        trustedVoterCount,
        trustedResolverCount
      } = this.resolveWithOracle(market, bets, reputationByAccount);

      if (!resolver) {
        continue;
      }

      try {
        if (market.status === "OPEN") {
          const attestation = await selfAttestMarket(
            {
              marketId: market.id,
              attestedByAccountId: resolver.wallet.accountId,
              proposedOutcome: resolvedOutcome,
              reason: `ClawDBot self-attest (${trustedVoterCount} trusted voters, confidence ${confidence.toFixed(
                2
              )})`,
              challengeWindowMinutes: 3
            },
            { client: this.getClient(resolver.wallet) }
          );
          this.#eventBus.publish("clawdbot.market.self_attested", {
            marketId: market.id,
            resolvedOutcome,
            resolverBotId: resolver.agent.id,
            trustedVoterCount,
            trustedResolverCount,
            oracleConfidence: confidence,
            challengeWindowEndsAt: attestation.challengeWindowEndsAt
          });

          if (confidence < 0.65 && market.outcomes.length > 1) {
            const challengers = this
              .getTrustedResolverRuntimes(reputationByAccount)
              .filter((runtime) => runtime.agent.id !== resolver.agent.id);
            const challenger = challengers[0];

            if (challenger) {
              const alternateOutcome =
                market.outcomes.find((outcome) => outcome !== resolvedOutcome) ?? resolvedOutcome;
              const challenge = await challengeMarketResolution(
                {
                  marketId: market.id,
                  challengerAccountId: challenger.wallet.accountId,
                  proposedOutcome: alternateOutcome,
                  reason: "Peer challenge raised due to low confidence oracle signal."
                },
                { client: this.getClient(challenger.wallet) }
              );
              this.#eventBus.publish("clawdbot.market.challenged", {
                marketId: market.id,
                challenge: challenge.challenge
              });
            }
          }
          continue;
        }

        const trustedVoters = this.getTrustedResolverRuntimes(reputationByAccount);
        const voterPool = (trustedVoters.length > 0 ? trustedVoters : [resolver]).filter(
          (runtime) => !this.isIneligibleOracleVoter(market, runtime.wallet.accountId)
        );
        if (voterPool.length === 0) {
          this.#eventBus.publish("clawdbot.market.resolve_error", {
            marketId: market.id,
            error: "No eligible oracle voters available after excluding creator/challengers."
          });
          continue;
        }
        const maxVotes = Math.max(
          this.#oracleMinVoters,
          2,
          Math.ceil(voterPool.length * this.#oracleQuorumPercent)
        );

        for (const voter of voterPool.slice(0, maxVotes)) {
          const storeSnapshot = getMarketStore();
          const priorVotes = [
            ...((storeSnapshot.markets.get(market.id)?.oracleVotes ?? []) as Array<{
              id: string;
              voterAccountId: string;
              outcome: string;
              confidence: number;
            }>)
          ];
          const botBets = bets.filter((bet) => bet.bettorAccountId === voter.wallet.accountId);
          const ownTotals: Record<string, number> = {};

          for (const bet of botBets) {
            ownTotals[bet.outcome] = (ownTotals[bet.outcome] ?? 0) + bet.amountHbar;
          }

          const voteOutcome =
            Object.entries(ownTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ??
            market.selfAttestation?.proposedOutcome ??
            resolvedOutcome;
          const voteResult = await submitOracleVote(
            {
              marketId: market.id,
              voterAccountId: voter.wallet.accountId,
              outcome: voteOutcome,
              confidence: Math.max(0.3, confidence),
              reason: "Reputation-weighted peer oracle vote",
              reputationScore: reputationByAccount[voter.wallet.accountId] ?? voter.agent.reputationScore
            },
            {
              client: this.getClient(voter.wallet),
              oracleMinVotes: this.#oracleMinVoters,
              oracleEligibleVoterCount: voterPool.length,
              oracleQuorumPercent: this.#oracleQuorumPercent,
              reputationLookup: (accountId) => reputationByAccount[accountId] ?? 0
            }
          );

          this.#eventBus.publish("clawdbot.market.oracle_vote", {
            marketId: market.id,
            vote: voteResult.vote
          });

          if (voteResult.finalized) {
            const allVotes = [...priorVotes, voteResult.vote];
            const uniqueVotes = Array.from(
              allVotes.reduce((map, vote) => {
                map.set(vote.voterAccountId.trim(), vote);
                return map;
              }, new Map<string, (typeof allVotes)[number]>()).values()
            );
            await this.applyOracleVoteReputation(market.id, voteResult.finalized.resolvedOutcome, uniqueVotes, {
              attesterAccountId: voteResult.finalized.resolvedByAccountId
            });
            await this.applySelfAttestationReputation(
              market.id,
              voteResult.finalized.resolvedOutcome,
              market.selfAttestation,
              { attesterAccountId: voteResult.finalized.resolvedByAccountId }
            );
            this.#eventBus.publish("clawdbot.market.resolved", {
              marketId: market.id,
              resolvedOutcome: voteResult.finalized.resolvedOutcome,
              resolverBotId: voter.agent.id,
              trustedVoterCount,
              trustedResolverCount,
              oracleConfidence: confidence
            });
            break;
          }
        }
      } catch (error) {
        this.#eventBus.publish("clawdbot.market.resolve_error", {
          marketId: market.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  private async applyOracleVoteReputation(
    marketId: string,
    resolvedOutcome: string,
    votes: Array<{
      id: string;
      voterAccountId: string;
      outcome: string;
      confidence: number;
    }>,
    options: { attesterAccountId: string }
  ): Promise<void> {
    for (const vote of votes) {
      const isCorrect = vote.outcome === resolvedOutcome;
      const scoreDelta = isCorrect ? ORACLE_VOTE_SCORE_DELTA_CORRECT : ORACLE_VOTE_SCORE_DELTA_INCORRECT;

      try {
        const attestation = await submitAttestation({
          subjectAccountId: vote.voterAccountId,
          attesterAccountId: options.attesterAccountId,
          scoreDelta,
          confidence: vote.confidence,
          reason: isCorrect
            ? `Oracle vote matched final outcome (${resolvedOutcome}) for market ${marketId}`
            : `Oracle vote diverged from final outcome (${resolvedOutcome}) for market ${marketId}`,
          tags: ["oracle-vote", isCorrect ? "vote-correct" : "vote-incorrect", `market:${marketId}`]
        });
        this.#eventBus.publish("reputation.attested", attestation);
      } catch (error) {
        this.#eventBus.publish("clawdbot.reputation.error", {
          marketId,
          voterAccountId: vote.voterAccountId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  private async applySelfAttestationReputation(
    marketId: string,
    resolvedOutcome: string,
    selfAttestation:
      | {
          proposedOutcome?: string;
          attestedByAccountId?: string;
        }
      | undefined,
    options: { attesterAccountId: string }
  ): Promise<void> {
    const proposedOutcome = parseNonEmptyString(selfAttestation?.proposedOutcome, "");
    const attestedByAccountId = parseNonEmptyString(selfAttestation?.attestedByAccountId, "");

    if (!proposedOutcome || !attestedByAccountId || proposedOutcome === resolvedOutcome) {
      return;
    }

    try {
      const attestation = await submitAttestation({
        subjectAccountId: attestedByAccountId,
        attesterAccountId: options.attesterAccountId,
        scoreDelta: INCORRECT_SELF_ATTESTATION_SCORE_DELTA,
        confidence: 1,
        reason: `Self-attested outcome (${proposedOutcome}) was overturned by final resolution (${resolvedOutcome}) for market ${marketId}`,
        tags: ["market-self-attestation", "attestation-incorrect", `market:${marketId}`]
      });
      this.#eventBus.publish("reputation.attested", attestation);
    } catch (error) {
      this.#eventBus.publish("clawdbot.reputation.error", {
        marketId,
        voterAccountId: attestedByAccountId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private getTrustedResolverRuntimes(
    reputationByAccount: Record<string, number>
  ): RuntimeBot[] {
    return Array.from(this.#runtimeBots.values())
      .filter((runtime) => {
        const score = reputationByAccount[runtime.wallet.accountId] ?? runtime.agent.reputationScore;
        return score >= this.#oracleMinReputationScore;
      })
      .sort((left, right) => {
        const leftScore = reputationByAccount[left.wallet.accountId] ?? left.agent.reputationScore;
        const rightScore = reputationByAccount[right.wallet.accountId] ?? right.agent.reputationScore;
        return rightScore - leftScore;
      });
  }

  private pickFallbackResolver(): RuntimeBot | undefined {
    return (
      Array.from(this.#runtimeBots.values()).find(
        (runtime) => runtime.wallet.accountId === this.#operatorAccountId
      ) ?? Array.from(this.#runtimeBots.values())[0]
    );
  }

  private resolveWithOracle(
    market: Market,
    bets: readonly { bettorAccountId: string; outcome: string; amountHbar: number }[],
    reputationByAccount: Record<string, number>
  ): {
    resolvedOutcome: string;
    resolver: RuntimeBot | undefined;
    confidence: number;
    trustedVoterCount: number;
    trustedResolverCount: number;
  } {
    const trustedResolvers = this.getTrustedResolverRuntimes(reputationByAccount);
    const trustedResolverCount = trustedResolvers.length;
    const outcomeWeights = Object.fromEntries(market.outcomes.map((outcome) => [outcome, 0]));
    let trustedVoterCount = 0;

    for (const runtime of trustedResolvers) {
      const botBets = bets.filter((bet) => bet.bettorAccountId === runtime.wallet.accountId);

      if (botBets.length === 0) {
        continue;
      }

      const ownTotals: Record<string, number> = {};

      for (const bet of botBets) {
        ownTotals[bet.outcome] = (ownTotals[bet.outcome] ?? 0) + bet.amountHbar;
      }

      const bestOwn = Object.entries(ownTotals).sort((a, b) => b[1] - a[1])[0];

      if (!bestOwn || bestOwn[1] <= 0) {
        continue;
      }

      const score = reputationByAccount[runtime.wallet.accountId] ?? runtime.agent.reputationScore;
      outcomeWeights[bestOwn[0]] = (outcomeWeights[bestOwn[0]] ?? 0) + bestOwn[1] * Math.max(1, score);
      trustedVoterCount += 1;
    }

    if (trustedVoterCount < this.#oracleMinVoters) {
      for (const bet of bets) {
        if (!(bet.outcome in outcomeWeights)) {
          continue;
        }

        const score = reputationByAccount[bet.bettorAccountId] ?? 0;

        if (score < this.#oracleMinReputationScore) {
          continue;
        }

        outcomeWeights[bet.outcome] = (outcomeWeights[bet.outcome] ?? 0) + bet.amountHbar * Math.max(1, score);
      }
    }

    const totalOracleWeight = Object.values(outcomeWeights).reduce((sum, value) => sum + value, 0);

    if (totalOracleWeight <= 0) {
      for (const bet of bets) {
        if (!(bet.outcome in outcomeWeights)) {
          continue;
        }

        outcomeWeights[bet.outcome] = (outcomeWeights[bet.outcome] ?? 0) + bet.amountHbar;
      }
    }

    const sorted = Object.entries(outcomeWeights).sort((a, b) => b[1] - a[1]);
    const winningWeight = sorted[0]?.[1] ?? 0;
    const totalWeight = sorted.reduce((sum, [, weight]) => sum + weight, 0);
    const resolvedOutcome =
      winningWeight > 0 ? (sorted[0]?.[0] ?? market.outcomes[0] ?? "YES") : (market.outcomes[0] ?? "YES");
    const resolver = trustedResolvers[0] ?? this.pickFallbackResolver();
    const confidence = totalWeight > 0 ? winningWeight / totalWeight : 0;

    return {
      resolvedOutcome,
      resolver,
      confidence,
      trustedVoterCount,
      trustedResolverCount
    };
  }

  private async settleResolvedMarkets(): Promise<void> {
    const store = getMarketStore();
    const resolved = Array.from(store.markets.values()).filter(
      (market) => market.status === "RESOLVED" && market.resolvedOutcome
    );

    for (const market of resolved) {
      const bets = store.bets.get(market.id) ?? [];

      if (bets.length === 0) {
        continue;
      }

      const escrowClient = this.clientForAccount(market.escrowAccountId);

      if (!escrowClient) {
        this.#eventBus.publish("clawdbot.market.claim_error", {
          marketId: market.id,
          error: `No signer available for escrow account ${market.escrowAccountId}`
        });
        continue;
      }

      const winners = Array.from(
        new Set(
          bets
            .filter((bet) => bet.outcome === market.resolvedOutcome)
            .map((bet) => bet.bettorAccountId)
        )
      );

      for (const winnerAccountId of winners) {
        try {
          const claim = await claimWinnings(
            {
              marketId: market.id,
              accountId: winnerAccountId,
              payoutAccountId: winnerAccountId
            },
            { client: escrowClient }
          );

          for (const runtime of this.#runtimeBots.values()) {
            if (runtime.wallet.accountId === winnerAccountId) {
              runtime.agent.adjustBankroll(claim.payoutHbar);
              break;
            }
          }

          this.#eventBus.publish("clawdbot.market.claimed", claim);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);

          if (/already claimed/i.test(message)) {
            continue;
          }

          this.#eventBus.publish("clawdbot.market.claim_error", {
            marketId: market.id,
            accountId: winnerAccountId,
            error: message
          });
        }
      }
    }
  }

  private getOperatorClient(): HederaClient {
    return this.getClient({
      accountId: this.#operatorAccountId,
      privateKey: this.#operatorPrivateKey,
      privateKeyType: this.#operatorPrivateKeyType
    });
  }

  private clientForAccount(accountId: string): HederaClient | null {
    if (accountId === this.#operatorAccountId) {
      return this.getOperatorClient();
    }

    if (this.#escrowWallet && accountId === this.#escrowWallet.accountId) {
      return this.getClient(this.#escrowWallet);
    }

    for (const runtime of this.#runtimeBots.values()) {
      if (runtime.wallet.accountId === accountId) {
        return this.getClient(runtime.wallet);
      }
    }

    return null;
  }

  private async ensureSharedEscrow(): Promise<void> {
    if (!this.#enabled || this.#escrowWallet) {
      return;
    }

    const persisted = this.#walletStore.get();

    if (persisted.escrow?.accountId && persisted.escrow?.privateKey) {
      this.#escrowWallet = persisted.escrow;
      return;
    }

    const created = await createAccount(1, {
      client: this.getOperatorClient(),
      keyStore: this.#keyStore
    });

    this.#escrowWallet = {
      accountId: created.accountId,
      privateKey: created.privateKey,
      privateKeyType: "der"
    };

    persisted.escrow = this.#escrowWallet;
    this.#walletStore.persist(persisted);

    this.#eventBus.publish("clawdbot.escrow.created", {
      accountId: this.#escrowWallet.accountId
    });
  }

  private async reclaimHbar(): Promise<void> {
    const RESERVE_HBAR = 0.5;

    const walletsToReclaim: AgentWallet[] = [];

    for (const runtime of this.#runtimeBots.values()) {
      if (runtime.origin === "internal") {
        walletsToReclaim.push(runtime.wallet);
      }
    }

    if (this.#escrowWallet) {
      walletsToReclaim.push(this.#escrowWallet);
    }

    for (const wallet of walletsToReclaim) {
      try {
        const balance = await getBalance(wallet.accountId, {
          client: this.getClient(wallet)
        });
        const reclaimable = balance.hbar - RESERVE_HBAR;

        if (reclaimable <= 0.01) {
          continue;
        }

        const amount = Number(reclaimable.toFixed(8));
        await transferHbar(wallet.accountId, this.#operatorAccountId, amount, {
          client: this.getClient(wallet)
        });

        this.#eventBus.publish("clawdbot.hbar.reclaimed", {
          fromAccountId: wallet.accountId,
          toAccountId: this.#operatorAccountId,
          amountHbar: amount
        });
      } catch {
        // Best-effort; don't block shutdown
      }
    }
  }

  private getClient(wallet: AgentWallet): HederaClient {
    const cacheKey = `${wallet.accountId}:${wallet.privateKeyType}:${wallet.privateKey}`;
    const cached = this.#clientCache.get(cacheKey);

    if (cached) {
      return cached;
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
}

export function createClawdbotNetwork(options: ClawdbotNetworkOptions): ClawdbotNetwork {
  return new ClawdbotNetwork(options);
}
