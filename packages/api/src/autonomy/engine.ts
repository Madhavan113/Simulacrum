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
  clamp,
  createAccount,
  createHederaClient,
  getBalance,
  transferHbar,
  type HederaNetwork,
  type PersistentStore
} from "@simulacrum/core";
import {
  claimWinnings,
  createMarket,
  getMarketStore,
  persistMarketStore,
  placeBet,
  resolveMarket,
  submitOracleVote,
  type Market
} from "@simulacrum/markets";
import {
  calculateReputationScore,
  getReputationStore
} from "@simulacrum/reputation";
import {
  acceptRequest,
  completeRequest,
  getServiceStore,
  requestService,
  type Service
} from "@simulacrum/services";

import type { ApiEventBus } from "../events.js";
import type { AgentRegistry } from "../routes/agents.js";
import {
  createWalletPersistence,
  type PersistedWallet,
  type WalletPersistenceStore
} from "../wallet-persistence.js";

export interface ServiceFulfillmentProvider {
  fulfillServiceRequest(
    providerAccountId: string,
    serviceName: string,
    serviceDescription: string,
    userInput: string
  ): Promise<string>;
}

type HederaClient = ReturnType<typeof createHederaClient>;

export interface AutonomyEngineOptions {
  eventBus: ApiEventBus;
  registry: AgentRegistry;
  enabled?: boolean;
  tickMs?: number;
  agentCount?: number;
  initialAgentBalanceHbar?: number;
  challengeEveryTicks?: number;
  serviceEveryTicks?: number;
  serviceBuyChance?: number;
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

export class AutonomyEngine {
  readonly #eventBus: ApiEventBus;
  readonly #registry: AgentRegistry;
  readonly #enabled: boolean;
  readonly #tickMs: number;
  readonly #targetAgents: number;
  readonly #initialAgentBalanceHbar: number;
  readonly #challengeEveryTicks: number;
  readonly #serviceEveryTicks: number;
  readonly #serviceBuyChance: number;
  readonly #minOpenMarkets: number;
  readonly #marketCloseMinutes: number;
  readonly #minBetHbar: number;
  readonly #maxBetHbar: number;

  #fulfillmentProvider: ServiceFulfillmentProvider | null = null;

  readonly #network: HederaNetwork;
  readonly #operatorAccountId: string;
  readonly #operatorPrivateKey: string;
  readonly #operatorPrivateKeyType: AgentWallet["privateKeyType"];

  readonly #keyStore: EncryptedInMemoryKeyStore;
  readonly #runtimeAgents = new Map<string, RuntimeAgent>();
  readonly #clientCache = new Map<string, HederaClient>();
  readonly #walletStore: PersistentStore<WalletPersistenceStore>;
  #escrowWallet: PersistedWallet | null = null;

  #interval: ReturnType<typeof setInterval> | null = null;
  #running = false;
  #tickCount = 0;
  #lastTickAt: Date | null = null;
  #lastError: string | null = null;
  #activeTick = false;
  #starting = false;
  #stopRequested = false;
  #settleFailedMarkets = new Set<string>();

  constructor(options: AutonomyEngineOptions) {
    this.#eventBus = options.eventBus;
    this.#registry = options.registry;
    this.#enabled = options.enabled ?? false;
    this.#tickMs = options.tickMs ?? DEFAULT_TICK_MS;
    this.#targetAgents = options.agentCount ?? 3;
    this.#initialAgentBalanceHbar = options.initialAgentBalanceHbar ?? 25;
    this.#challengeEveryTicks = options.challengeEveryTicks ?? 3;
    this.#serviceEveryTicks = options.serviceEveryTicks ?? 2;
    this.#serviceBuyChance = options.serviceBuyChance ?? 0.25;
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
    this.#walletStore = createWalletPersistence("autonomy-wallets.json");

    if (this.#enabled && (!this.#operatorAccountId || !this.#operatorPrivateKey)) {
      throw new Error(
        "Autonomy engine requires HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in environment."
      );
    }
  }

  setFulfillmentProvider(provider: ServiceFulfillmentProvider): void {
    this.#fulfillmentProvider = provider;
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
    if (!this.#enabled || this.#running || this.#starting) {
      return;
    }

    this.#starting = true;
    this.#stopRequested = false;

    try {
      await this.ensureSharedEscrow();
      await this.ensureAgentPopulation();

      if (this.#stopRequested) {
        return;
      }

      await this.runTick();

      if (this.#stopRequested) {
        return;
      }

      this.#running = true;
      this.#interval = setInterval(() => {
        void this.runTick();
      }, this.#tickMs);
      this.#eventBus.publish("autonomy.started", this.getStatus());
    } finally {
      this.#starting = false;
    }
  }

  async stop(): Promise<void> {
    this.#stopRequested = true;

    if (!this.#running && !this.#starting) {
      return;
    }

    if (this.#interval) {
      clearInterval(this.#interval);
      this.#interval = null;
    }

    this.#running = false;

    await this.reclaimHbar();

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
      await this.runServiceConsumption();
      await this.voteOnDisputedMarkets();
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

    const escrowAccountId = this.#escrowWallet?.accountId ?? challenger.wallet.accountId;
    const client = this.getClient(challenger.wallet);
    const resolvedOutcomes = input.outcomes && input.outcomes.length > 1 ? input.outcomes : ["YES", "NO"];
    const defaultFunding = 25;
    const seedOrders = resolvedOutcomes.flatMap((outcome) => [
      { outcome, side: "BID" as const, quantity: 5, price: 0.4 },
      { outcome, side: "ASK" as const, quantity: 5, price: 0.6 }
    ]);

    const created = await createMarket(
      {
        question,
        description: target
          ? `Agent challenge: ${challenger.agent.name} vs ${target.agent.name}`
          : `Agent challenge issued by ${challenger.agent.name}`,
        creatorAccountId: challenger.wallet.accountId,
        escrowAccountId,
        closeTime,
        outcomes: resolvedOutcomes,
        initialFundingHbar: defaultFunding,
        seedOrders
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

    const persisted = this.#walletStore.get();

    if (this.#runtimeAgents.size === 0 && persisted.wallets.length > 0) {
      const repStore = getReputationStore();

      for (let index = 0; index < persisted.wallets.length && this.#runtimeAgents.size < this.#targetAgents; index += 1) {
        const wallet = persisted.wallets[index]!;
        const sequence = index + 1;
        const strategy = this.strategyForIndex(sequence);
        const restoredRep = calculateReputationScore(wallet.accountId, repStore.attestations);
        const agent = new BaseAgent(
          {
            id: randomUUID(),
            name: `AutoAgent-${sequence}`,
            accountId: wallet.accountId,
            bankrollHbar: this.#initialAgentBalanceHbar,
            reputationScore: restoredRep.score
          },
          strategy
        );

        const runtime: RuntimeAgent = {
          agent,
          wallet: {
            accountId: wallet.accountId,
            privateKey: wallet.privateKey,
            privateKeyType: wallet.privateKeyType
          }
        };

        this.#runtimeAgents.set(agent.id, runtime);
        this.#registry.add(agent);

        this.#eventBus.publish("autonomy.agent.restored", {
          agentId: agent.id,
          accountId: agent.accountId,
          strategy: strategy.name
        });
      }
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

      const wallet: AgentWallet = {
        accountId: created.accountId,
        privateKey: created.privateKey,
        privateKeyType: "der"
      };

      const runtime: RuntimeAgent = {
        agent,
        wallet
      };

      this.#runtimeAgents.set(agent.id, runtime);
      this.#registry.add(agent);

      persisted.wallets.push(wallet);
      this.#walletStore.persist(persisted);

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
        const total = relevant.reduce((sum, attestation) => sum + attestation.scoreDelta, 0);
        map[runtime.wallet.accountId] = clamp(50 + total, 0, 100);
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
        if (runtime.wallet.accountId === market.creatorAccountId ||
            runtime.wallet.accountId === market.escrowAccountId) {
          continue;
        }

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
          runtime.agent.adjustReputation(0.75);
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

  private async voteOnDisputedMarkets(): Promise<void> {
    const store = getMarketStore();
    const now = Date.now();
    const disputed = Array.from(store.markets.values()).filter((market) => {
      if (market.status !== "DISPUTED" || !market.selfAttestation) {
        return false;
      }
      const windowEndMs = market.challengeWindowEndsAt
        ? Date.parse(market.challengeWindowEndsAt)
        : 0;
      return !Number.isFinite(windowEndMs) || now >= windowEndMs;
    });

    if (disputed.length === 0) {
      return;
    }

    const reputationLookup = (accountId: string): number => {
      const repStore = getReputationStore();
      const score = calculateReputationScore(accountId, repStore.attestations);
      return score.score;
    };

    const reputationByAccount = this.buildReputationMap();
    const sentimentMap = this.buildSentimentMap();

    for (const market of disputed) {
      const alreadyVoted = new Set(
        (market.oracleVotes ?? []).map((v) => v.voterAccountId)
      );

      for (const runtime of this.#runtimeAgents.values()) {
        const accountId = runtime.wallet.accountId;

        if (alreadyVoted.has(accountId)) {
          continue;
        }

        const snapshot = toMarketSnapshot(market);
        const decision = await runtime.agent.decideBet(snapshot, {
          now: new Date(),
          reputationByAccount,
          marketSentiment: sentimentMap
        });

        const outcome = decision?.outcome ?? market.selfAttestation!.proposedOutcome;

        try {
          const result = await submitOracleVote(
            {
              marketId: market.id,
              voterAccountId: accountId,
              outcome,
              confidence: clamp(runtime.agent.reputationScore / 100, 0.1, 1),
              reason: `Autonomy agent ${runtime.agent.name} oracle vote`
            },
            {
              client: this.getClient(runtime.wallet),
              reputationLookup
            }
          );

          this.#eventBus.publish("autonomy.oracle_vote", {
            marketId: market.id,
            agentId: runtime.agent.id,
            outcome,
            finalized: !!result.finalized
          });

          if (result.finalized) {
            this.#eventBus.publish("autonomy.market.resolved", result.finalized);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);

          // Ineligible or already-voted errors are expected, skip silently
          if (/ineligible|already submitted/i.test(message)) {
            continue;
          }

          this.#eventBus.publish("autonomy.oracle_vote.error", {
            marketId: market.id,
            agentId: runtime.agent.id,
            error: message
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
        const resolverAccountId = this.clientForAccount(market.creatorAccountId)
          ? market.creatorAccountId
          : this.#operatorAccountId;
        const resolverClient = this.clientForAccount(resolverAccountId) ?? this.getOperatorClient();

        const resolution = await resolveMarket(
          {
            marketId: market.id,
            resolvedOutcome,
            resolvedByAccountId: resolverAccountId,
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
      if (this.#settleFailedMarkets.has(market.id)) {
        continue;
      }

      const bets = store.bets.get(market.id) ?? [];

      if (bets.length === 0) {
        market.status = "SETTLED";
        persistMarketStore(store);
        continue;
      }

      const escrowClient = this.clientForAccount(market.escrowAccountId);

      if (!escrowClient) {
        this.#settleFailedMarkets.add(market.id);
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
      let permanentFailure = false;

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

          // Update the winning agent's in-memory bankroll to reflect their payout
          for (const runtime of this.#runtimeAgents.values()) {
            if (runtime.wallet.accountId === winnerAccountId) {
              runtime.agent.adjustBankroll(claim.payoutHbar);
              break;
            }
          }

          this.#eventBus.publish("autonomy.market.claimed", claim);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);

          if (/already claimed/i.test(message)) {
            continue;
          }

          permanentFailure = true;
          this.#eventBus.publish("autonomy.market.claim_error", {
            marketId: market.id,
            accountId: winnerAccountId,
            error: message
          });
        }
      }

      if (!permanentFailure) {
        market.status = "SETTLED";
        persistMarketStore(store);
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

    for (const runtime of this.#runtimeAgents.values()) {
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

    this.#eventBus.publish("autonomy.escrow.created", {
      accountId: this.#escrowWallet.accountId
    });
  }

  private async runServiceConsumption(): Promise<void> {
    if (this.#tickCount % this.#serviceEveryTicks !== 0) {
      return;
    }

    const store = getServiceStore();
    const activeServices = Array.from(store.services.values()).filter(
      (svc) => svc.status === "ACTIVE"
    );

    if (activeServices.length === 0) {
      return;
    }

    for (const runtime of this.#runtimeAgents.values()) {
      const affordable = activeServices.filter(
        (svc) =>
          svc.priceHbar <= runtime.agent.bankrollHbar * 0.3 &&
          svc.providerAccountId !== runtime.wallet.accountId
      );

      if (affordable.length === 0) {
        continue;
      }

      if (Math.random() > this.#serviceBuyChance) {
        continue;
      }

      const service = affordable[Math.floor(Math.random() * affordable.length)]!;
      const input = this.generateServiceInput(service);

      try {
        const svcRequest = await requestService(
          {
            serviceId: service.id,
            requesterAccountId: runtime.wallet.accountId,
            input
          },
          { client: this.getClient(runtime.wallet) }
        );

        runtime.agent.adjustBankroll(-service.priceHbar);

        await acceptRequest({
          serviceId: service.id,
          requestId: svcRequest.id,
          providerAccountId: service.providerAccountId
        });

        if (this.#fulfillmentProvider) {
          try {
            const output = await this.#fulfillmentProvider.fulfillServiceRequest(
              service.providerAccountId,
              service.name,
              service.description,
              input
            );

            await completeRequest({
              serviceId: service.id,
              requestId: svcRequest.id,
              providerAccountId: service.providerAccountId,
              output
            });

            this.#eventBus.publish("autonomy.service.completed", {
              agentId: runtime.agent.id,
              accountId: runtime.wallet.accountId,
              serviceId: service.id,
              serviceName: service.name,
              priceHbar: service.priceHbar,
              requestId: svcRequest.id
            });
          } catch {
            this.#eventBus.publish("autonomy.service.fulfillment_error", {
              agentId: runtime.agent.id,
              serviceId: service.id,
              requestId: svcRequest.id
            });
          }
        } else {
          this.#eventBus.publish("autonomy.service.requested", {
            agentId: runtime.agent.id,
            accountId: runtime.wallet.accountId,
            serviceId: service.id,
            serviceName: service.name,
            priceHbar: service.priceHbar,
            requestId: svcRequest.id
          });
        }
      } catch (error) {
        this.#eventBus.publish("autonomy.service.error", {
          agentId: runtime.agent.id,
          serviceId: service.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  private generateServiceInput(service: Service): string {
    const inputs: Record<string, string[]> = {
      ORACLE: [
        "What is the current market sentiment for the top prediction markets?",
        "Provide a data-driven forecast on the most active market topic.",
        "What are the key on-chain signals agents should watch right now?"
      ],
      DATA: [
        "Provide the latest activity metrics for prediction markets on Hedera.",
        "Summarize recent agent trading volume and market participation.",
        "What tokens or markets are seeing unusual volume today?"
      ],
      RESEARCH: [
        "Analyze the risk factors in the current prediction market landscape.",
        "Research which market categories have the highest return potential.",
        "What emerging trends should agents be positioning for?"
      ],
      ANALYSIS: [
        "Provide a technical analysis of recent prediction market odds movements.",
        "Analyze the correlation between agent reputation scores and bet accuracy.",
        "Which markets show the most mispriced odds right now?"
      ],
      COMPUTE: [
        "Run a backtesting simulation on a contrarian betting strategy.",
        "Calculate optimal bet sizing for a bankroll management strategy.",
        "Optimize portfolio allocation across the active prediction markets."
      ],
      CUSTOM: [
        "Provide your best actionable insight for an autonomous trading agent.",
        "What should I prioritize in the current market environment?",
        "Give me your top recommendation based on current conditions."
      ]
    };

    const options = inputs[service.category] ?? inputs.CUSTOM!;
    return options[Math.floor(Math.random() * options.length)]!;
  }

  private async reclaimHbar(): Promise<void> {
    const RESERVE_HBAR = 0.5;

    const walletsToReclaim: AgentWallet[] = [];

    for (const runtime of this.#runtimeAgents.values()) {
      walletsToReclaim.push(runtime.wallet);
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

        this.#eventBus.publish("autonomy.hbar.reclaimed", {
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

    const MAX_CLIENT_CACHE_SIZE = 50;
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

}

export function createAutonomyEngine(options: AutonomyEngineOptions): AutonomyEngine {
  return new AutonomyEngine(options);
}
