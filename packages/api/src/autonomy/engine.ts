import { randomUUID } from "node:crypto";

import {
  BaseAgent,
  createContrarianStrategy,
  createRandomStrategy,
  createReputationBasedStrategy,
  type AgentStrategy,
  type MarketSnapshot
} from "@simulacrum/agents";
import {
  EncryptedInMemoryKeyStore,
  createAccount,
  createHederaClient,
  type HederaNetwork
} from "@simulacrum/core";
import {
  claimWinnings,
  createMarket,
  getMarketStore,
  placeBet,
  resolveMarket,
  type Market
} from "@simulacrum/markets";
import { getReputationStore, submitAttestation } from "@simulacrum/reputation";

import type { ApiEventBus } from "../events.js";
import type { AgentRegistry } from "../routes/agents.js";

type HederaClient = ReturnType<typeof createHederaClient>;

export interface AutonomyEngineOptions {
  eventBus: ApiEventBus;
  registry: AgentRegistry;
  enabled?: boolean;
  tickMs?: number;
  agentCount?: number;
  initialAgentBalanceHbar?: number;
  challengeEveryTicks?: number;
  minOpenMarkets?: number;
  marketCloseMinutes?: number;
  minBetHbar?: number;
  maxBetHbar?: number;
}

export interface AutonomyChallengeInput {
  question: string;
  outcomes?: string[];
  closeMinutes?: number;
  challengerAgentId?: string;
  targetAgentId?: string;
}

export interface AutonomyStatus {
  enabled: boolean;
  running: boolean;
  tickMs: number;
  tickCount: number;
  agentCount: number;
  managedAgentCount: number;
  openMarkets: number;
  lastTickAt?: string;
  lastError?: string;
}

interface AgentWallet {
  accountId: string;
  privateKey: string;
  privateKeyType: "der" | "ecdsa" | "ed25519" | "auto";
}

interface RuntimeAgent {
  agent: BaseAgent;
  wallet: AgentWallet;
}

interface MarketSentiment {
  [outcome: string]: number;
}

const DEFAULT_TICK_MS = 15_000;
const BET_PARTICIPATION_SCORE_DELTA = 0.75;
const BET_PARTICIPATION_CONFIDENCE = 0.2;

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class AutonomyEngine {
  readonly #eventBus: ApiEventBus;
  readonly #registry: AgentRegistry;
  readonly #enabled: boolean;
  readonly #tickMs: number;
  readonly #targetAgents: number;
  readonly #initialAgentBalanceHbar: number;
  readonly #challengeEveryTicks: number;
  readonly #minOpenMarkets: number;
  readonly #marketCloseMinutes: number;
  readonly #minBetHbar: number;
  readonly #maxBetHbar: number;

  readonly #network: HederaNetwork;
  readonly #operatorAccountId: string;
  readonly #operatorPrivateKey: string;
  readonly #operatorPrivateKeyType: AgentWallet["privateKeyType"];

  readonly #keyStore: EncryptedInMemoryKeyStore;
  readonly #runtimeAgents = new Map<string, RuntimeAgent>();
  readonly #clientCache = new Map<string, HederaClient>();

  #interval: ReturnType<typeof setInterval> | null = null;
  #running = false;
  #tickCount = 0;
  #lastTickAt: Date | null = null;
  #lastError: string | null = null;
  #activeTick = false;

  constructor(options: AutonomyEngineOptions) {
    this.#eventBus = options.eventBus;
    this.#registry = options.registry;
    this.#enabled = options.enabled ?? false;
    this.#tickMs = options.tickMs ?? DEFAULT_TICK_MS;
    this.#targetAgents = options.agentCount ?? 3;
    this.#initialAgentBalanceHbar = options.initialAgentBalanceHbar ?? 25;
    this.#challengeEveryTicks = options.challengeEveryTicks ?? 3;
    this.#minOpenMarkets = options.minOpenMarkets ?? 2;
    this.#marketCloseMinutes = options.marketCloseMinutes ?? 30;
    this.#minBetHbar = options.minBetHbar ?? 1;
    this.#maxBetHbar = options.maxBetHbar ?? 5;

    this.#network = normalizeNetwork(process.env.HEDERA_NETWORK);
    this.#operatorAccountId = process.env.HEDERA_ACCOUNT_ID ?? "";
    this.#operatorPrivateKey = process.env.HEDERA_PRIVATE_KEY ?? "";
    this.#operatorPrivateKeyType = normalizePrivateKeyType(process.env.HEDERA_PRIVATE_KEY_TYPE);

    const secret = process.env.HEDERA_KEYSTORE_SECRET ?? "simulacrum-autonomy";
    this.#keyStore = new EncryptedInMemoryKeyStore(secret);

    if (this.#enabled && (!this.#operatorAccountId || !this.#operatorPrivateKey)) {
      throw new Error(
        "Autonomy engine requires HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in environment."
      );
    }
  }

  getStatus(): AutonomyStatus {
    const store = getMarketStore();
    const openMarkets = Array.from(store.markets.values()).filter((market) => market.status === "OPEN").length;

    return {
      enabled: this.#enabled,
      running: this.#running,
      tickMs: this.#tickMs,
      tickCount: this.#tickCount,
      agentCount: this.#registry.all().length,
      managedAgentCount: this.#runtimeAgents.size,
      openMarkets,
      lastTickAt: this.#lastTickAt?.toISOString(),
      lastError: this.#lastError ?? undefined
    };
  }

  async start(): Promise<void> {
    if (!this.#enabled || this.#running) {
      return;
    }

    await this.ensureAgentPopulation();
    await this.runTick();

    this.#interval = setInterval(() => {
      void this.runTick();
    }, this.#tickMs);
    this.#running = true;
    this.#eventBus.publish("autonomy.started", this.getStatus());
  }

  async stop(): Promise<void> {
    if (!this.#running) {
      return;
    }

    if (this.#interval) {
      clearInterval(this.#interval);
      this.#interval = null;
    }

    this.#running = false;
    this.#eventBus.publish("autonomy.stopped", this.getStatus());

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
      await this.ensureAgentPopulation();

      this.#tickCount += 1;
      const now = new Date();

      if (this.shouldCreateChallengeMarket()) {
        await this.createChallengeMarket({
          question: this.generateChallengeQuestion(),
          closeMinutes: this.#marketCloseMinutes
        });
      }

      await this.runAgentBetting(now);
      await this.resolveExpiredMarkets(now);
      await this.settleResolvedMarkets();

      this.#lastTickAt = now;
      this.#lastError = null;
      this.#eventBus.publish("autonomy.tick", this.getStatus());
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error);
      this.#eventBus.publish("autonomy.error", {
        error: this.#lastError,
        tickCount: this.#tickCount
      });
    } finally {
      this.#activeTick = false;
    }
  }

  async createChallengeMarket(input: AutonomyChallengeInput): Promise<{ marketId: string }> {
    if (!this.#enabled) {
      throw new Error("Autonomy engine is disabled.");
    }

    await this.ensureAgentPopulation();

    const runtimeAgents = Array.from(this.#runtimeAgents.values());

    if (runtimeAgents.length === 0) {
      throw new Error("No runtime agents are available.");
    }

    const challenger = input.challengerAgentId
      ? this.#runtimeAgents.get(input.challengerAgentId)
      : runtimeAgents[Math.floor(Math.random() * runtimeAgents.length)];

    if (!challenger) {
      throw new Error("Unable to resolve challenger agent.");
    }

    const target =
      input.targetAgentId && this.#runtimeAgents.has(input.targetAgentId)
        ? this.#runtimeAgents.get(input.targetAgentId)
        : runtimeAgents.find((candidate) => candidate.agent.id !== challenger.agent.id);

    const question = input.question.trim().length > 0
      ? input.question
      : target
        ? `${challenger.agent.name} challenges ${target.agent.name} to complete a task before deadline`
        : `${challenger.agent.name} challenges all agents on a new task`;

    const closeMinutes = Math.max(5, Math.round(input.closeMinutes ?? this.#marketCloseMinutes));
    const closeTime = new Date(Date.now() + closeMinutes * 60 * 1000).toISOString();

    const client = this.getClient(challenger.wallet);
    const created = await createMarket(
      {
        question,
        description: target
          ? `Agent challenge: ${challenger.agent.name} vs ${target.agent.name}`
          : `Agent challenge issued by ${challenger.agent.name}`,
        creatorAccountId: challenger.wallet.accountId,
        escrowAccountId: challenger.wallet.accountId,
        closeTime,
        outcomes: input.outcomes && input.outcomes.length > 1 ? input.outcomes : ["YES", "NO"]
      },
      { client }
    );

    this.#eventBus.publish("autonomy.market.created", {
      marketId: created.market.id,
      question: created.market.question,
      challengerAgentId: challenger.agent.id,
      targetAgentId: target?.agent.id
    });

    return {
      marketId: created.market.id
    };
  }

  private shouldCreateChallengeMarket(): boolean {
    if (this.#tickCount === 1) {
      return true;
    }

    if (this.#tickCount % this.#challengeEveryTicks === 0) {
      return true;
    }

    const store = getMarketStore();
    const openMarkets = Array.from(store.markets.values()).filter((market) => market.status === "OPEN").length;

    return openMarkets < this.#minOpenMarkets;
  }

  private generateChallengeQuestion(): string {
    const prompts = [
      "Will the challenger agent complete a coding task in 30 minutes?",
      "Will the challenged agent ship a bug fix before timeout?",
      "Will this agent win the next autonomous strategy duel?",
      "Will the selected agent keep uptime above 99% this round?",
      "Will the challenger produce the correct analysis before deadline?"
    ];

    return prompts[Math.floor(Math.random() * prompts.length)] ?? "Will the agent complete the challenge?";
  }

  private async ensureAgentPopulation(): Promise<void> {
    if (!this.#enabled) {
      return;
    }

    while (this.#runtimeAgents.size < this.#targetAgents) {
      const sequence = this.#runtimeAgents.size + 1;
      const created = await createAccount(this.#initialAgentBalanceHbar, {
        client: this.getOperatorClient(),
        keyStore: this.#keyStore
      });

      const strategy = this.strategyForIndex(sequence);
      const agent = new BaseAgent(
        {
          id: randomUUID(),
          name: `AutoAgent-${sequence}`,
          accountId: created.accountId,
          bankrollHbar: this.#initialAgentBalanceHbar,
          reputationScore: 50
        },
        strategy
      );

      const runtime: RuntimeAgent = {
        agent,
        wallet: {
          accountId: created.accountId,
          privateKey: created.privateKey,
          privateKeyType: "der"
        }
      };

      this.#runtimeAgents.set(agent.id, runtime);
      this.#registry.add(agent);

      this.#eventBus.publish("autonomy.agent.created", {
        agentId: agent.id,
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

  private buildReputationMap(): Record<string, number> {
    const map: Record<string, number> = {};

    for (const runtime of this.#runtimeAgents.values()) {
      map[runtime.wallet.accountId] = runtime.agent.reputationScore;
    }

    const store = getReputationStore();

    for (const runtime of this.#runtimeAgents.values()) {
      if (store.attestations.length === 0) {
        continue;
      }

      const relevant = store.attestations.filter(
        (attestation) => attestation.subjectAccountId === runtime.wallet.accountId
      );

      if (relevant.length > 0) {
        const avg = relevant.reduce((sum, attestation) => sum + attestation.scoreDelta, 0) / relevant.length;
        map[runtime.wallet.accountId] = clamp(50 + avg, 0, 100);
      }
    }

    return map;
  }

  private buildSentimentMap(): Record<string, MarketSentiment> {
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

  private async runAgentBetting(now: Date): Promise<void> {
    const store = getMarketStore();
    const markets = Array.from(store.markets.values()).filter((market) => market.status === "OPEN");

    if (markets.length === 0) {
      return;
    }

    const reputationByAccount = this.buildReputationMap();
    const marketSentiment = this.buildSentimentMap();

    for (const market of markets) {
      const bets = store.bets.get(market.id) ?? [];

      for (const runtime of this.#runtimeAgents.values()) {
        if (bets.some((bet) => bet.bettorAccountId === runtime.wallet.accountId)) {
          continue;
        }

        const decision = await runtime.agent.decideBet(toMarketSnapshot(market), {
          now,
          reputationByAccount,
          marketSentiment
        });

        if (!decision) {
          continue;
        }

        const amount = clamp(decision.amountHbar, this.#minBetHbar, this.#maxBetHbar);

        if (amount <= 0) {
          continue;
        }

        try {
          await placeBet(
            {
              marketId: market.id,
              bettorAccountId: runtime.wallet.accountId,
              outcome: decision.outcome,
              amountHbar: amount
            },
            {
              client: this.getClient(runtime.wallet)
            }
          );

          runtime.agent.adjustBankroll(-amount);

          this.#eventBus.publish("autonomy.bet.placed", {
            marketId: market.id,
            agentId: runtime.agent.id,
            accountId: runtime.wallet.accountId,
            outcome: decision.outcome,
            amountHbar: amount,
            rationale: decision.rationale
          });
          await this.applyBetParticipationReputation(market.id, runtime.wallet.accountId);
        } catch (error) {
          this.#eventBus.publish("autonomy.bet.error", {
            marketId: market.id,
            agentId: runtime.agent.id,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
  }

  private async resolveExpiredMarkets(now: Date): Promise<void> {
    const store = getMarketStore();
    const candidates = Array.from(store.markets.values()).filter(
      (market) => market.status === "OPEN" && Date.parse(market.closeTime) <= now.getTime()
    );

    for (const market of candidates) {
      const bets = store.bets.get(market.id) ?? [];
      const totals: Record<string, number> = {};

      for (const outcome of market.outcomes) {
        totals[outcome] = 0;
      }

      for (const bet of bets) {
        totals[bet.outcome] = (totals[bet.outcome] ?? 0) + bet.amountHbar;
      }

      const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
      const resolvedOutcome =
        (sorted[0]?.[1] ?? 0) > 0
          ? (sorted[0]?.[0] ?? market.outcomes[0] ?? "YES")
          : (market.outcomes[0] ?? "YES");

      try {
        const resolverClient = this.clientForAccount(market.creatorAccountId) ?? this.getOperatorClient();

        const resolution = await resolveMarket(
          {
            marketId: market.id,
            resolvedOutcome,
            resolvedByAccountId: this.#operatorAccountId,
            reason: "Autonomous resolution"
          },
          { client: resolverClient }
        );

        this.#eventBus.publish("autonomy.market.resolved", resolution);
      } catch (error) {
        this.#eventBus.publish("autonomy.market.resolve_error", {
          marketId: market.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
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
        this.#eventBus.publish("autonomy.market.claim_error", {
          marketId: market.id,
          error: `No signer available for escrow account ${market.escrowAccountId}`
        });
        continue;
      }

      const winners = bets
        .filter((bet) => bet.outcome === market.resolvedOutcome)
        .map((bet) => bet.bettorAccountId);

      const uniqueWinners = Array.from(new Set(winners));

      for (const winnerAccountId of uniqueWinners) {
        try {
          const claim = await claimWinnings(
            {
              marketId: market.id,
              accountId: winnerAccountId,
              payoutAccountId: winnerAccountId
            },
            { client: escrowClient }
          );

          this.#eventBus.publish("autonomy.market.claimed", claim);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);

          if (/already claimed/i.test(message)) {
            continue;
          }

          this.#eventBus.publish("autonomy.market.claim_error", {
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

    for (const runtime of this.#runtimeAgents.values()) {
      if (runtime.wallet.accountId === accountId) {
        return this.getClient(runtime.wallet);
      }
    }

    return null;
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

  private hasBetParticipationAttestation(accountId: string, marketId: string): boolean {
    const markerTag = `market-participation:${marketId}`;
    const store = getReputationStore();
    return store.attestations.some(
      (attestation) =>
        attestation.subjectAccountId === accountId && attestation.tags.includes(markerTag)
    );
  }

  private async applyBetParticipationReputation(marketId: string, accountId: string): Promise<void> {
    if (this.hasBetParticipationAttestation(accountId, marketId)) {
      return;
    }

    try {
      const attestation = await submitAttestation({
        subjectAccountId: accountId,
        attesterAccountId: "SYSTEM_BET_ACTIVITY",
        scoreDelta: BET_PARTICIPATION_SCORE_DELTA,
        confidence: BET_PARTICIPATION_CONFIDENCE,
        reason: `Placed stake in market ${marketId}`,
        tags: ["market-participation", `market:${marketId}`, `market-participation:${marketId}`]
      });
      this.#eventBus.publish("reputation.attested", attestation);
    } catch (error) {
      this.#eventBus.publish("autonomy.reputation.error", {
        marketId,
        accountId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export function createAutonomyEngine(options: AutonomyEngineOptions): AutonomyEngine {
  return new AutonomyEngine(options);
}
