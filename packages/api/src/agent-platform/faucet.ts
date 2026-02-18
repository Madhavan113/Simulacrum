import { createHederaClient, getBalance, transferHbar, type HederaNetwork } from "@simulacrum/core";

import {
  getAgentPlatformStore,
  persistAgentPlatformStore
} from "./store.js";
import type { AgentPlatformOptions, AgentPlatformStore } from "./types.js";
import type { AgentAuthService } from "./auth.js";

type HederaClient = ReturnType<typeof createHederaClient>;

const DEFAULT_REFILL_THRESHOLD_HBAR = 3;
const DEFAULT_REFILL_TARGET_HBAR = 20;
const DEFAULT_REFILL_COOLDOWN_SECONDS = 5 * 60;
const DEFAULT_REFILL_INTERVAL_MS = 30 * 1000;
const DEFAULT_DAILY_FAUCET_CAP_HBAR = 5_000;
const DEFAULT_INITIAL_FUNDING_HBAR = 20;

interface FaucetDeps {
  getBalance: typeof getBalance;
  transferHbar: typeof transferHbar;
  createHederaClient: typeof createHederaClient;
  now: () => Date;
}

export interface FaucetRefillResult {
  funded: boolean;
  reason?: string;
  accountId: string;
  amountHbar: number;
  resultingBalanceHbar?: number;
  transactionId?: string;
  transactionUrl?: string;
}

export interface AgentFaucetServiceOptions
  extends Pick<
    AgentPlatformOptions,
    | "initialFundingHbar"
    | "refillThresholdHbar"
    | "refillTargetHbar"
    | "refillCooldownSeconds"
    | "refillIntervalMs"
    | "dailyFaucetCapHbar"
  > {
  authService: AgentAuthService;
  store?: AgentPlatformStore;
  network?: HederaNetwork;
  deps?: Partial<FaucetDeps>;
}

export class AgentFaucetError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "AgentFaucetError";
  }
}

function normalizeNetwork(value: string | undefined): HederaNetwork {
  const normalized = (value ?? "testnet").toLowerCase();

  if (normalized === "testnet" || normalized === "mainnet" || normalized === "previewnet") {
    return normalized;
  }

  return "testnet";
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class AgentFaucetService {
  readonly #authService: AgentAuthService;
  readonly #store: AgentPlatformStore;
  readonly #network: HederaNetwork;
  readonly #initialFundingHbar: number;
  readonly #refillThresholdHbar: number;
  readonly #refillTargetHbar: number;
  readonly #refillCooldownSeconds: number;
  readonly #refillIntervalMs: number;
  readonly #dailyFaucetCapHbar: number;
  readonly #deps: FaucetDeps;

  #interval: ReturnType<typeof setInterval> | null = null;
  #operatorClient: HederaClient | null = null;

  constructor(options: AgentFaucetServiceOptions) {
    this.#authService = options.authService;
    this.#store = getAgentPlatformStore(options.store);
    this.#network = options.network ?? normalizeNetwork(process.env.HEDERA_NETWORK);
    this.#initialFundingHbar = Math.max(
      0,
      Number.isFinite(options.initialFundingHbar ?? Number(process.env.AGENT_INITIAL_FUNDING_HBAR))
        ? Number(options.initialFundingHbar ?? process.env.AGENT_INITIAL_FUNDING_HBAR)
        : DEFAULT_INITIAL_FUNDING_HBAR
    );
    this.#refillThresholdHbar = Math.max(
      0,
      Number.isFinite(options.refillThresholdHbar ?? Number(process.env.AGENT_REFILL_THRESHOLD_HBAR))
        ? Number(options.refillThresholdHbar ?? process.env.AGENT_REFILL_THRESHOLD_HBAR)
        : DEFAULT_REFILL_THRESHOLD_HBAR
    );
    this.#refillTargetHbar = Math.max(
      this.#refillThresholdHbar,
      Number.isFinite(options.refillTargetHbar ?? Number(process.env.AGENT_REFILL_TARGET_HBAR))
        ? Number(options.refillTargetHbar ?? process.env.AGENT_REFILL_TARGET_HBAR)
        : DEFAULT_REFILL_TARGET_HBAR
    );
    this.#refillCooldownSeconds = Math.max(
      0,
      Number.isFinite(options.refillCooldownSeconds ?? Number(process.env.AGENT_REFILL_COOLDOWN_SECONDS))
        ? Number(options.refillCooldownSeconds ?? process.env.AGENT_REFILL_COOLDOWN_SECONDS)
        : DEFAULT_REFILL_COOLDOWN_SECONDS
    );
    this.#refillIntervalMs = Math.max(
      5_000,
      Number.isFinite(options.refillIntervalMs ?? Number(process.env.AGENT_REFILL_INTERVAL_MS))
        ? Number(options.refillIntervalMs ?? process.env.AGENT_REFILL_INTERVAL_MS)
        : DEFAULT_REFILL_INTERVAL_MS
    );
    this.#dailyFaucetCapHbar = Math.max(
      0,
      Number.isFinite(options.dailyFaucetCapHbar ?? Number(process.env.AGENT_DAILY_FAUCET_CAP_HBAR))
        ? Number(options.dailyFaucetCapHbar ?? process.env.AGENT_DAILY_FAUCET_CAP_HBAR)
        : DEFAULT_DAILY_FAUCET_CAP_HBAR
    );
    this.#deps = {
      getBalance,
      transferHbar,
      createHederaClient,
      now: () => new Date(),
      ...options.deps
    };
  }

  get initialFundingHbar(): number {
    return this.#initialFundingHbar;
  }

  start(): void {
    if (this.#interval || !this.isFundingEnabled()) {
      return;
    }

    this.#interval = setInterval(() => {
      void this.runRefillSweep();
    }, this.#refillIntervalMs);
  }

  stop(): void {
    if (this.#interval) {
      clearInterval(this.#interval);
      this.#interval = null;
    }

    if (this.#operatorClient) {
      this.#operatorClient.close();
      this.#operatorClient = null;
    }
  }

  isFundingEnabled(): boolean {
    return this.#network === "testnet" && Boolean(this.operatorAccountId && this.operatorPrivateKey);
  }

  recordRegistrationFunding(agentId: string, amountHbar: number): void {
    if (amountHbar <= 0) {
      return;
    }

    this.recordDispense(agentId, amountHbar);
  }

  async requestManualRefill(agentId: string): Promise<FaucetRefillResult> {
    return this.refillAgent(agentId, true);
  }

  async runRefillSweep(): Promise<void> {
    const agents = this.#authService.listAgents();

    for (const agent of agents) {
      try {
        await this.refillAgent(agent.id, false);
      } catch {
        // Keep sweep resilient; per-agent errors are isolated.
      }
    }
  }

  private async refillAgent(agentId: string, enforceCooldown: boolean): Promise<FaucetRefillResult> {
    const profile = this.#authService.getAgent(agentId);

    if (!profile) {
      throw new AgentFaucetError(`Agent ${agentId} was not found.`);
    }

    if (!this.isFundingEnabled()) {
      return {
        funded: false,
        reason: "Funding is disabled for this network or missing operator credentials.",
        accountId: profile.walletAccountId,
        amountHbar: 0
      };
    }

    const now = this.#deps.now();
    const ledger = this.#store.faucet.byAgentId[agentId] ?? {
      totalDispensedHbar: 0,
      refillCount: 0
    };

    if (enforceCooldown && ledger.lastRefillAt) {
      const elapsedMs = now.getTime() - Date.parse(ledger.lastRefillAt);

      if (elapsedMs < this.#refillCooldownSeconds * 1000) {
        return {
          funded: false,
          reason: "Refill cooldown is active.",
          accountId: profile.walletAccountId,
          amountHbar: 0
        };
      }
    }

    const client = this.#authService.getClientForAgent(agentId);
    const balance = await this.#deps.getBalance(profile.walletAccountId, { client });

    if (balance.hbar >= this.#refillThresholdHbar) {
      return {
        funded: false,
        reason: "Balance is above refill threshold.",
        accountId: profile.walletAccountId,
        amountHbar: 0,
        resultingBalanceHbar: balance.hbar
      };
    }

    const amount = Number((this.#refillTargetHbar - balance.hbar).toFixed(8));

    if (amount <= 0) {
      return {
        funded: false,
        reason: "Refill target already met.",
        accountId: profile.walletAccountId,
        amountHbar: 0,
        resultingBalanceHbar: balance.hbar
      };
    }

    const todayKey = formatDateKey(now);
    const spentToday = this.#store.faucet.byDate[todayKey] ?? 0;

    if (spentToday + amount > this.#dailyFaucetCapHbar) {
      return {
        funded: false,
        reason: "Daily faucet cap reached.",
        accountId: profile.walletAccountId,
        amountHbar: 0,
        resultingBalanceHbar: balance.hbar
      };
    }

    const operatorClient = this.getOperatorClient();

    if (!operatorClient) {
      return {
        funded: false,
        reason: "Operator signer is unavailable.",
        accountId: profile.walletAccountId,
        amountHbar: 0,
        resultingBalanceHbar: balance.hbar
      };
    }

    const transfer = await this.#deps.transferHbar(
      this.operatorAccountId,
      profile.walletAccountId,
      amount,
      { client: operatorClient }
    );
    this.recordDispense(agentId, amount);
    this.#store.faucet.byAgentId[agentId] = {
      ...ledger,
      totalDispensedHbar: Number((ledger.totalDispensedHbar + amount).toFixed(8)),
      refillCount: ledger.refillCount + 1,
      lastRefillAt: now.toISOString()
    };
    persistAgentPlatformStore(this.#store);

    return {
      funded: true,
      accountId: profile.walletAccountId,
      amountHbar: amount,
      resultingBalanceHbar: Number((balance.hbar + amount).toFixed(8)),
      transactionId: transfer.transactionId,
      transactionUrl: transfer.transactionUrl
    };
  }

  private recordDispense(agentId: string, amountHbar: number): void {
    const now = this.#deps.now();
    const dateKey = formatDateKey(now);
    const byDate = this.#store.faucet.byDate[dateKey] ?? 0;
    this.#store.faucet.totalDispensedHbar = Number(
      (this.#store.faucet.totalDispensedHbar + amountHbar).toFixed(8)
    );
    this.#store.faucet.byDate[dateKey] = Number((byDate + amountHbar).toFixed(8));

    const ledger = this.#store.faucet.byAgentId[agentId] ?? {
      totalDispensedHbar: 0,
      refillCount: 0
    };
    this.#store.faucet.byAgentId[agentId] = {
      ...ledger,
      totalDispensedHbar: Number((ledger.totalDispensedHbar + amountHbar).toFixed(8))
    };

    persistAgentPlatformStore(this.#store);
  }

  private get operatorAccountId(): string {
    return process.env.HEDERA_ACCOUNT_ID ?? "";
  }

  private get operatorPrivateKey(): string {
    return process.env.HEDERA_PRIVATE_KEY ?? "";
  }

  private get operatorPrivateKeyType(): "auto" | "ecdsa" | "ed25519" | "der" {
    const candidate = (process.env.HEDERA_PRIVATE_KEY_TYPE ?? "auto").toLowerCase();

    if (candidate === "ecdsa" || candidate === "ed25519" || candidate === "der" || candidate === "auto") {
      return candidate;
    }

    return "auto";
  }

  private getOperatorClient(): HederaClient | null {
    if (!this.isFundingEnabled()) {
      return null;
    }

    if (this.#operatorClient) {
      return this.#operatorClient;
    }

    this.#operatorClient = this.#deps.createHederaClient({
      network: this.#network,
      accountId: this.operatorAccountId,
      privateKey: this.operatorPrivateKey,
      privateKeyType: this.operatorPrivateKeyType
    });

    return this.#operatorClient;
  }
}

export function createAgentFaucetService(options: AgentFaucetServiceOptions): AgentFaucetService {
  return new AgentFaucetService(options);
}
