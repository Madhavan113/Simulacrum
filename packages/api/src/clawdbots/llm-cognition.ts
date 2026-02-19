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

// Free OpenRouter models to rotate through when rate-limited
const FALLBACK_MODELS = [
  "google/gemma-3-27b-it:free",
  "google/gemma-3-12b-it:free",
  "google/gemma-3-4b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "qwen/qwen3-4b:free",
  "nvidia/nemotron-nano-9b-v2:free",
  "stepfun/step-3.5-flash:free",
];

function stripMarkdownFences(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return fenceMatch ? fenceMatch[1]!.trim() : trimmed;
}

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(stripMarkdownFences(raw)) as T;
  } catch {
    return null;
  }
}

function waitAction(reason: string): ClawdbotPlannedAction {
  return {
    type: "WAIT",
    confidence: 0,
    rationale: reason
  };
}

export class LlmCognitionEngine {
  readonly #config: LlmProviderConfig;

  constructor(config: LlmProviderConfig) {
    this.#config = config;
  }

  async generateGoal(context: GoalContext): Promise<ClawdbotGoal> {
    const now = new Date().toISOString();
    const result = await this.#askGoalModel(context);

    if (!result) {
      return {
        id: randomUUID(),
        botId: context.bot.id,
        title: "Waiting for LLM",
        detail: "LLM provider unavailable — skipping this tick.",
        status: "PENDING",
        createdAt: now,
        updatedAt: now
      };
    }

    return {
      id: randomUUID(),
      botId: context.bot.id,
      title: result.title,
      detail: result.detail,
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

    return waitAction("LLM provider unavailable — no scripted fallback, waiting for next tick.");
  }

  /**
   * Send a chat completion request, rotating through fallback models on 429.
   */
  async #chatCompletion(
    label: string,
    messages: Array<{ role: string; content: string }>,
    temperature = 0.7
  ): Promise<string | null> {
    const apiKey = this.#config.apiKey;

    if (!apiKey) {
      console.warn(`[llm-cognition] No API key configured — skipping ${label}.`);
      return null;
    }

    const baseUrl = this.#config.baseUrl ?? "https://api.openai.com/v1";
    const primaryModel = this.#config.model ?? "gpt-4o-mini";
    const models = [primaryModel, ...FALLBACK_MODELS.filter((m) => m !== primaryModel)];

    for (const model of models) {
      const url = `${baseUrl}/chat/completions`;
      console.log(`[llm-cognition] ${label} → model=${model}`);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model, temperature, messages })
        });

        if (response.status === 429) {
          console.warn(`[llm-cognition] ${label} rate-limited on ${model}, trying next model...`);
          continue;
        }

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          console.error(`[llm-cognition] ${label} failed: HTTP ${response.status} — ${body}`);
          return null;
        }

        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = payload.choices?.[0]?.message?.content;

        if (!content) {
          console.warn(`[llm-cognition] ${label} returned empty content from ${model}, trying next model...`);
          continue;
        }

        console.log(`[llm-cognition] ${label} succeeded with ${model}`);
        return content;
      } catch (error) {
        console.error(`[llm-cognition] ${label} fetch error on ${model}: ${error instanceof Error ? error.message : error}`);
        continue;
      }
    }

    console.error(`[llm-cognition] ${label} failed: all models exhausted.`);
    return null;
  }

  async #askGoalModel(context: GoalContext): Promise<{ title: string; detail: string } | null> {
    const prompt = [
      "You are an autonomous prediction-market degen on the Simulacrum platform (Hedera blockchain).",
      "You have STRONG opinions. You talk trash about bad markets, call out weak bets, and flex on your wins.",
      "Your role is to CREATE spicy markets about real-world events, PLACE bold BETS on existing markets, and PUBLISH ORDERS to provide liquidity.",
      "You must NEVER resolve markets — resolution is handled by oracle consensus only.",
      "Be opinionated and entertaining. Your goal titles should have personality — trash talk other positions, brag about your edge, or call out obvious mispricing.",
      "Produce a single goal with title and detail. Focus on market creation, betting, or liquidity provision.",
      "Return JSON only, no markdown fences: {\"title\": string, \"detail\": string}.",
      `Bot: ${context.bot.name}`,
      `Open markets: ${context.markets.filter((market) => market.status === "OPEN").length}`
    ].join("\n");

    const raw = await this.#chatCompletion("Goal", [{ role: "user", content: prompt }], 0.7);

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
    const openMarkets = context.markets.filter((m) => m.status === "OPEN");
    const marketInfo = openMarkets.length > 0
      ? openMarkets.map((m) => `${m.id}: "${m.question}" [${m.outcomes.join("/")}]`).join("; ")
      : "none";
    const prompt = [
      "You are an autonomous prediction-market degen on the Simulacrum platform (Hedera blockchain).",
      "You have STRONG opinions and you're not afraid to share them. Talk trash, call out bad odds, flex your edge.",
      "Pick one action aligned to the goal. You must NEVER resolve markets — that is not your role.",
      "Allowed action types: CREATE_MARKET, PUBLISH_ORDER, PLACE_BET, WAIT.",
      "For CREATE_MARKET: provide a prompt (the market question about a real-world verifiable event) and initialOddsByOutcome. Make market questions spicy and engaging.",
      "For PLACE_BET: provide marketId, outcome, and amountHbar (1-5 HBAR). Go big or go home.",
      "For PUBLISH_ORDER: provide marketId, outcome, side (BID/ASK), quantity, and price (0.01-0.99).",
      "Your rationale should be entertaining — trash talk other positions, brag about your conviction, roast bad pricing.",
      "Return JSON only, no markdown fences, with fields:",
      "{\"type\": string, \"marketId\"?: string, \"outcome\"?: string, \"side\"?: \"BID\"|\"ASK\", \"quantity\"?: number, \"price\"?: number, \"amountHbar\"?: number, \"prompt\"?: string, \"initialOddsByOutcome\"?: {\"OUTCOME\": number}, \"confidence\": number, \"rationale\": string}",
      `Goal: ${context.goal.title} - ${context.goal.detail}`,
      `Open markets: ${marketInfo}`
    ].join("\n");

    const raw = await this.#chatCompletion("Action", [{ role: "user", content: prompt }], 0.7);

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
