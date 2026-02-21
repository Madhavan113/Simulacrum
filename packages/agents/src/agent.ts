import { randomUUID } from "node:crypto";

import { clamp, validateNonEmptyString, validateNonNegativeNumber } from "@simulacrum/core";

export type AgentMode = "AGGRESSIVE" | "BALANCED" | "CONSERVATIVE";

export interface MarketSnapshot {
  id: string;
  question: string;
  creatorAccountId: string;
  outcomes: string[];
  status: "OPEN" | "CLOSED" | "RESOLVED" | "DISPUTED" | "SETTLED";
  closeTime: string;
}

export interface AgentContext {
  now: Date;
  reputationByAccount: Record<string, number>;
  marketSentiment: Record<string, Record<string, number>>;
}

export interface BetDecision {
  outcome: string;
  amountHbar: number;
  confidence: number;
  rationale: string;
}

export interface AgentStrategy {
  name: string;
  decide(
    agent: BaseAgent,
    market: MarketSnapshot,
    context: AgentContext
  ): BetDecision | null | Promise<BetDecision | null>;
}

export interface AgentConfig {
  id?: string;
  name: string;
  accountId: string;
  bankrollHbar: number;
  reputationScore?: number;
  mode?: AgentMode;
}

export class AgentError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "AgentError";
  }
}

export class BaseAgent {
  readonly id: string;
  readonly name: string;
  readonly accountId: string;
  readonly mode: AgentMode;

  #bankrollHbar: number;
  #reputationScore: number;
  #strategy: AgentStrategy;

  constructor(config: AgentConfig, strategy: AgentStrategy) {
    validateNonEmptyString(config.name, "name");
    validateNonEmptyString(config.accountId, "accountId");
    validateNonNegativeNumber(config.bankrollHbar, "bankrollHbar");

    this.id = config.id ?? randomUUID();
    this.name = config.name;
    this.accountId = config.accountId;
    this.mode = config.mode ?? "BALANCED";
    this.#bankrollHbar = config.bankrollHbar;
    this.#reputationScore = clamp(config.reputationScore ?? 50, 0, 100);
    this.#strategy = strategy;
  }

  get bankrollHbar(): number {
    return this.#bankrollHbar;
  }

  get reputationScore(): number {
    return this.#reputationScore;
  }

  get strategy(): AgentStrategy {
    return this.#strategy;
  }

  setStrategy(strategy: AgentStrategy): void {
    this.#strategy = strategy;
  }

  adjustBankroll(deltaHbar: number): void {
    if (!Number.isFinite(deltaHbar)) {
      throw new AgentError("deltaHbar must be finite.");
    }

    const next = this.#bankrollHbar + deltaHbar;

    if (next < 0) {
      throw new AgentError(`Insufficient bankroll for adjustment ${deltaHbar}.`);
    }

    this.#bankrollHbar = next;
  }

  adjustReputation(delta: number): void {
    if (!Number.isFinite(delta)) {
      throw new AgentError("delta must be finite.");
    }

    this.#reputationScore = clamp(this.#reputationScore + delta, 0, 100);
  }

  async decideBet(market: MarketSnapshot, context: AgentContext): Promise<BetDecision | null> {
    if (market.status !== "OPEN") {
      return null;
    }

    if (Date.parse(market.closeTime) <= context.now.getTime()) {
      return null;
    }

    const decision = await this.#strategy.decide(this, market, context);

    if (!decision) {
      return null;
    }

    if (!market.outcomes.includes(decision.outcome)) {
      throw new AgentError(
        `${this.name} strategy selected invalid outcome ${decision.outcome} for market ${market.id}.`
      );
    }

    if (!Number.isFinite(decision.amountHbar) || decision.amountHbar <= 0) {
      throw new AgentError("strategy returned invalid amountHbar.");
    }

    if (decision.amountHbar > this.#bankrollHbar) {
      return {
        ...decision,
        amountHbar: this.#bankrollHbar
      };
    }

    return decision;
  }
}
