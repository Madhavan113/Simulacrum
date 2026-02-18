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

function pickFirstOutcome(markets: MarketSnapshot[]): string {
  for (const market of markets) {
    if (market.outcomes.length > 0) {
      return market.outcomes[0] ?? "YES";
    }
  }

  return "YES";
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
    detail: "Add two-sided liquidity and sharpen implied probabilities."
  };
}

function fallbackAction(context: ActionContext): ClawdbotPlannedAction {
  const open = context.markets.filter((market) => market.status === "OPEN");

  if (open.length === 0) {
    return {
      type: "CREATE_MARKET",
      prompt: `[GOAL] ${context.goal.title}: Will the next community milestone ship on schedule?`,
      confidence: 0.75,
      rationale: "No active markets found, so creating one is the highest leverage move."
    };
  }

  const targetMarket = open[0];
  const targetOutcome = pickFirstOutcome(open);

  return {
    type: "PUBLISH_ORDER",
    marketId: targetMarket?.id,
    outcome: targetOutcome,
    side: "BID",
    quantity: 10,
    price: 0.62,
    confidence: 0.66,
    rationale: "Default market-making action adds visible orderbook depth."
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
      "You are controlling a community prediction-market bot.",
      "Produce a single concise goal with title and detail.",
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
    const prompt = [
      "You are controlling a community prediction-market bot.",
      "Pick one action aligned to the goal.",
      "Allowed action types: CREATE_MARKET, PUBLISH_ORDER, PLACE_BET, RESOLVE_MARKET, WAIT.",
      "Return JSON only with fields:",
      "{\"type\": string, \"marketId\"?: string, \"outcome\"?: string, \"side\"?: \"BID\"|\"ASK\", \"quantity\"?: number, \"price\"?: number, \"amountHbar\"?: number, \"prompt\"?: string, \"initialOddsByOutcome\"?: {\"OUTCOME\": number}, \"resolvedOutcome\"?: string, \"reason\"?: string, \"confidence\": number, \"rationale\": string}",
      `Goal: ${context.goal.title} - ${context.goal.detail}`,
      `Open markets: ${context.markets.filter((market) => market.status === "OPEN").map((market) => market.id).join(",") || "none"}`
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
      "RESOLVE_MARKET",
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

