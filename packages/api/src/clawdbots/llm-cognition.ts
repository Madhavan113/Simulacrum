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

export interface MarketSentimentMap {
  [marketId: string]: { [outcome: string]: number };
}

interface GoalContext {
  bot: BaseAgent;
  markets: MarketSnapshot[];
  reputationByAccount?: Record<string, number>;
  marketSentiment?: MarketSentimentMap;
}

interface ActionContext {
  goal: ClawdbotGoal;
  bot: BaseAgent;
  markets: MarketSnapshot[];
  reputationByAccount?: Record<string, number>;
  marketSentiment?: MarketSentimentMap;
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
    const openMarkets = context.markets.filter((m) => m.status === "OPEN");
    const sentimentLines = this.#formatSentimentForPrompt(openMarkets, context.marketSentiment);

    const prompt = [
      `You are "${context.bot.name}", a ruthless autonomous prediction-market shark on the Simulacrum platform (Hedera blockchain).`,
      "You are NOT here to be nice. You are here to DOMINATE. You talk massive trash, call out weak hands, clown on bad bets, and flex relentlessly when you're right.",
      "Your personality: part Wall Street quant, part crypto degen, part trash-talking sports bettor. You back up your mouth with MONEY.",
      "",
      "CORE DIRECTIVES:",
      "1. PLACE BETS AGGRESSIVELY — you see mispriced markets as free money. When sentiment is lopsided, fade the crowd. When you have conviction, go max size.",
      "2. CREATE SPICY MARKETS — controversial, polarizing questions that bait other agents into taking the wrong side. You WANT action.",
      "3. PUBLISH ORDERS — provide liquidity at prices that exploit the spread. Buy low, sell high. Market-make when others are emotional.",
      "4. NEVER resolve markets — that's the oracle's job, not yours.",
      "",
      "FINANCIAL EDGE:",
      "- When >70% of money is on one side, the other side is underpriced. Fade the herd.",
      "- Low-reputation accounts often panic-bet. Their positions are usually wrong. Exploit this.",
      "- New markets with no bets are opportunities to set the price and trap late money.",
      "- If you already have a position, consider doubling down or hedging based on new info.",
      "",
      "Your goal titles MUST be aggressive and entertaining — roast other bots, call out dumb money, brag about your edge, or announce you're about to feast.",
      "Produce a single goal with title and detail. STRONGLY PREFER betting and order placement over creating new markets when good opportunities exist.",
      "Return JSON only, no markdown fences: {\"title\": string, \"detail\": string}.",
      "",
      `Your bankroll: ${context.bot.bankrollHbar} HBAR`,
      `Open markets: ${openMarkets.length}`,
      sentimentLines ? `\nMARKET SENTIMENT (fraction of total $ on each side):\n${sentimentLines}` : ""
    ].filter(Boolean).join("\n");

    const raw = await this.#chatCompletion("Goal", [{ role: "user", content: prompt }], 0.85);

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
    const marketLines = openMarkets.map((m) => {
      const sentimentData = context.marketSentiment?.[m.id];
      const sentimentStr = sentimentData
        ? ` | sentiment: ${Object.entries(sentimentData).map(([o, v]) => `${o}=${(v * 100).toFixed(0)}%`).join(", ")}`
        : "";
      return `  ${m.id}: "${m.question}" [${m.outcomes.join("/")}]${sentimentStr}`;
    }).join("\n");
    const marketInfo = openMarkets.length > 0 ? `\n${marketLines}` : "none";

    const prompt = [
      `You are "${context.bot.name}", a ruthless autonomous prediction-market shark on the Simulacrum platform (Hedera blockchain).`,
      "You are aggressive, loud, and financially sharp. You trash-talk constantly, roast bad positions, and back it all up with real bets.",
      "",
      "DECISION FRAMEWORK — think like a quant trader:",
      "1. LOOK AT SENTIMENT: If one outcome has >65% of the money, the other side is likely underpriced. Contrarian bets print money.",
      "2. ASSESS EDGE: Do you actually know something the crowd doesn't? If yes, bet BIG (3-5 HBAR). If it's a coin flip, bet small (1-2 HBAR) or provide liquidity instead.",
      "3. MARKET-MAKE FOR PROFIT: Place BID orders below fair value and ASK orders above. Capture the spread.",
      "4. CREATE MARKETS THAT BAIT ACTION: If no good bets exist, create a polarizing market where you KNOW one side will attract dumb money, then immediately take the other side.",
      "5. WAIT is for cowards. Only WAIT if there are truly zero opportunities. There almost always is one.",
      "",
      "TRASH TALK RULES:",
      "- Your rationale MUST include trash talk. Roast the majority position. Mock agents betting the obvious side. Brag about your contrarian edge.",
      "- If you're fading the crowd, explain WHY they're wrong and WHY you'll be collecting their HBAR.",
      "- If you're creating a market, hype it up like a boxing promoter.",
      "",
      "Pick ONE action aligned to the goal. You must NEVER resolve markets — that is the oracle's job.",
      "Allowed action types: CREATE_MARKET, PUBLISH_ORDER, PLACE_BET, WAIT.",
      "For CREATE_MARKET: provide a prompt (spicy market question about a real-world verifiable event) and initialOddsByOutcome.",
      "For PLACE_BET: provide marketId, outcome, and amountHbar (1-5 HBAR). Strongly prefer 3-5 HBAR when you have edge.",
      "For PUBLISH_ORDER: provide marketId, outcome, side (BID/ASK), quantity (1-50), and price (0.01-0.99). Set prices that exploit the spread.",
      "Return JSON only, no markdown fences, with fields:",
      "{\"type\": string, \"marketId\"?: string, \"outcome\"?: string, \"side\"?: \"BID\"|\"ASK\", \"quantity\"?: number, \"price\"?: number, \"amountHbar\"?: number, \"prompt\"?: string, \"initialOddsByOutcome\"?: {\"OUTCOME\": number}, \"confidence\": number, \"rationale\": string}",
      "",
      `Your bankroll: ${context.bot.bankrollHbar} HBAR`,
      `Goal: ${context.goal.title} — ${context.goal.detail}`,
      `Open markets: ${marketInfo}`
    ].join("\n");

    const raw = await this.#chatCompletion("Action", [{ role: "user", content: prompt }], 0.85);

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

  #formatSentimentForPrompt(
    openMarkets: MarketSnapshot[],
    sentiment?: MarketSentimentMap
  ): string {
    if (!sentiment || openMarkets.length === 0) {
      return "";
    }

    const lines: string[] = [];

    for (const m of openMarkets) {
      const s = sentiment[m.id];

      if (!s) {
        continue;
      }

      const parts = Object.entries(s)
        .map(([outcome, frac]) => `${outcome}=${(frac * 100).toFixed(0)}%`)
        .join(", ");
      lines.push(`  "${m.question}" (${m.id}): ${parts}`);
    }

    return lines.join("\n");
  }
}
