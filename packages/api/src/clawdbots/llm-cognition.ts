import { randomUUID } from "node:crypto";

import type { BaseAgent, MarketSnapshot } from "@simulacrum/agents";

export type LlmProvider = "openai";

export interface LlmProviderConfig {
  provider?: LlmProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export type ClawdbotGoalStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export interface ClawdbotGoal {
  id: string;
  botId: string;
  title: string;
  detail: string;
  status: ClawdbotGoalStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

export type ClawdbotPlannedActionType =
  | "CREATE_MARKET"
  | "PUBLISH_ORDER"
  | "PLACE_BET"
  | "RESOLVE_MARKET"
  | "WAIT";

export interface ClawdbotPlannedAction {
  type: ClawdbotPlannedActionType;
  marketId?: string;
  outcome?: string;
  side?: "BID" | "ASK";
  initialOddsByOutcome?: Record<string, number>;
  quantity?: number;
  price?: number;
  amountHbar?: number;
  prompt?: string;
  resolvedOutcome?: string;
  reason?: string;
  confidence: number;
  rationale: string;
}

interface GoalContext {
  bot: BaseAgent;
  markets: MarketSnapshot[];
}

interface ActionContext {
  goal: ClawdbotGoal;
  bot: BaseAgent;
  markets: MarketSnapshot[];
}

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function fallbackGoal(context: GoalContext): Pick<ClawdbotGoal, "title" | "detail"> {
  if (context.markets.length === 0) {
    return {
      title: "Boot market liquidity",
      detail: "Create an initial market so community bots can begin trading."
    };
  }

  return {
    title: "Improve market depth",
    detail: "Add two-sided liquidity across YES and NO with competitive spreads."
  };
}

let fallbackActionCounter = 0;

function fallbackAction(context: ActionContext): ClawdbotPlannedAction {
  const open = context.markets.filter((market) => market.status === "OPEN");

  if (open.length === 0) {
    return {
      type: "CREATE_MARKET",
      prompt: `[GOAL] ${context.goal.title}: Will the next community milestone ship on schedule?`,
      initialOddsByOutcome: { YES: 55, NO: 45 },
      confidence: 0.75,
      rationale: "No active markets found, so creating one is the highest leverage move."
    };
  }

  const counter = fallbackActionCounter++;
  const targetMarket = open[counter % open.length];
  const outcomes = targetMarket?.outcomes ?? ["YES", "NO"];

  // Rotate through outcome/side combinations to build two-sided depth
  const configs: Array<{ outcome: string; side: "BID" | "ASK"; price: number }> = [];
  for (const outcome of outcomes) {
    configs.push({ outcome, side: "BID", price: 0.3 + Math.random() * 0.25 });
    configs.push({ outcome, side: "ASK", price: 0.55 + Math.random() * 0.25 });
  }

  const pick = configs[counter % configs.length] ?? configs[0]!;

  // Occasionally place a bet instead of an order for staked volume diversity
  if (counter % 5 === 0) {
    const betOutcome = outcomes[counter % outcomes.length] ?? "YES";
    return {
      type: "PLACE_BET",
      marketId: targetMarket?.id,
      outcome: betOutcome,
      amountHbar: 1 + Math.floor(Math.random() * 3),
      confidence: 0.6,
      rationale: `Staking on ${betOutcome} to add volume and signal conviction.`
    };
  }

  return {
    type: "PUBLISH_ORDER",
    marketId: targetMarket?.id,
    outcome: pick.outcome,
    side: pick.side,
    quantity: 5 + Math.floor(Math.random() * 15),
    price: Number(pick.price.toFixed(2)),
    confidence: 0.66,
    rationale: `Market-making ${pick.side} on ${pick.outcome} to build two-sided orderbook depth.`
  };
}

export class LlmCognitionEngine {
  readonly #config: LlmProviderConfig;

  constructor(config: LlmProviderConfig) {
    this.#config = config;
  }

  async generateGoal(context: GoalContext): Promise<ClawdbotGoal> {
    const now = new Date().toISOString();
    const fallback = fallbackGoal(context);
    const result = await this.#askGoalModel(context);

    return {
      id: randomUUID(),
      botId: context.bot.id,
      title: result?.title ?? fallback.title,
      detail: result?.detail ?? fallback.detail,
      status: "PENDING",
      createdAt: now,
      updatedAt: now
    };
  }

  async decideAction(context: ActionContext): Promise<ClawdbotPlannedAction> {
    const result = await this.#askActionModel(context);

    if (result) {
      return result;
    }

    return fallbackAction(context);
  }

  async #askGoalModel(context: GoalContext): Promise<{ title: string; detail: string } | null> {
    const apiKey = this.#config.apiKey;

    if (!apiKey) {
      return null;
    }

    const model = this.#config.model ?? "gpt-4o-mini";
    const baseUrl = this.#config.baseUrl ?? "https://api.openai.com/v1";
    const prompt = [
      "You are an autonomous prediction-market agent on the Simulacrum platform (Hedera blockchain).",
      "Your role is to CREATE markets about real-world events, PLACE BETS on existing markets, and PUBLISH ORDERS to provide liquidity.",
      "You must NEVER resolve markets — resolution is handled by market creators or oracle consensus only.",
      "Produce a single concise goal with title and detail. Focus on market creation, betting, or liquidity provision.",
      "Return JSON only: {\"title\": string, \"detail\": string}.",
      `Bot: ${context.bot.name}`,
      `Open markets: ${context.markets.filter((market) => market.status === "OPEN").length}`
    ].join("\n");

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = payload.choices?.[0]?.message?.content;

    if (!raw) {
      return null;
    }

    const parsed = parseJson<{ title?: string; detail?: string }>(raw);
    const title = parsed?.title?.trim();
    const detail = parsed?.detail?.trim();

    if (!title || !detail) {
      return null;
    }

    return { title, detail };
  }

  async #askActionModel(context: ActionContext): Promise<ClawdbotPlannedAction | null> {
    const apiKey = this.#config.apiKey;

    if (!apiKey) {
      return null;
    }

    const model = this.#config.model ?? "gpt-4o-mini";
    const baseUrl = this.#config.baseUrl ?? "https://api.openai.com/v1";
    const openMarkets = context.markets.filter((m) => m.status === "OPEN");
    const marketInfo = openMarkets.length > 0
      ? openMarkets.map((m) => `${m.id}: "${m.question}" [${m.outcomes.join("/")}]`).join("; ")
      : "none";
    const prompt = [
      "You are an autonomous prediction-market agent on the Simulacrum platform (Hedera blockchain).",
      "Pick one action aligned to the goal. You must NEVER resolve markets — that is not your role.",
      "Allowed action types: CREATE_MARKET, PUBLISH_ORDER, PLACE_BET, WAIT.",
      "For CREATE_MARKET: provide a prompt (the market question about a real-world verifiable event) and initialOddsByOutcome.",
      "For PLACE_BET: provide marketId, outcome, and amountHbar (1-5 HBAR).",
      "For PUBLISH_ORDER: provide marketId, outcome, side (BID/ASK), quantity, and price (0.01-0.99).",
      "Return JSON only with fields:",
      "{\"type\": string, \"marketId\"?: string, \"outcome\"?: string, \"side\"?: \"BID\"|\"ASK\", \"quantity\"?: number, \"price\"?: number, \"amountHbar\"?: number, \"prompt\"?: string, \"initialOddsByOutcome\"?: {\"OUTCOME\": number}, \"confidence\": number, \"rationale\": string}",
      `Goal: ${context.goal.title} - ${context.goal.detail}`,
      `Open markets: ${marketInfo}`
    ].join("\n");

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = payload.choices?.[0]?.message?.content;

    if (!raw) {
      return null;
    }

    const parsed = parseJson<Partial<ClawdbotPlannedAction>>(raw);

    if (!parsed?.type || typeof parsed.rationale !== "string") {
      return null;
    }

    const allowed = new Set<ClawdbotPlannedActionType>([
      "CREATE_MARKET",
      "PUBLISH_ORDER",
      "PLACE_BET",
      "WAIT"
    ]);

    if (!allowed.has(parsed.type as ClawdbotPlannedActionType)) {
      return null;
    }

    const initialOddsByOutcome =
      parsed.initialOddsByOutcome && typeof parsed.initialOddsByOutcome === "object"
        ? Object.entries(parsed.initialOddsByOutcome).reduce<Record<string, number>>((acc, [key, value]) => {
            const numericValue = Number(value);

            if (Number.isFinite(numericValue) && numericValue > 0) {
              acc[key.trim().toUpperCase()] = numericValue;
            }

            return acc;
          }, {})
        : undefined;

    return {
      type: parsed.type as ClawdbotPlannedActionType,
      marketId: parsed.marketId,
      outcome: parsed.outcome,
      side: parsed.side === "ASK" ? "ASK" : parsed.side === "BID" ? "BID" : undefined,
      initialOddsByOutcome:
        initialOddsByOutcome && Object.keys(initialOddsByOutcome).length > 0
          ? initialOddsByOutcome
          : undefined,
      quantity: typeof parsed.quantity === "number" ? parsed.quantity : undefined,
      price: typeof parsed.price === "number" ? parsed.price : undefined,
      amountHbar: typeof parsed.amountHbar === "number" ? parsed.amountHbar : undefined,
      prompt: parsed.prompt,
      resolvedOutcome: parsed.resolvedOutcome,
      reason: parsed.reason,
      confidence:
        typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.5,
      rationale: parsed.rationale
    };
  }
}

