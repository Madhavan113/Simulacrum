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
  | "REGISTER_SERVICE"
  | "REQUEST_SERVICE"
  | "CREATE_TASK"
  | "BID_TASK"
  | "WRITE_OPTION"
  | "BUY_OPTION"
  | "OPEN_POSITION"
  | "CLOSE_POSITION"
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
  // Service fields
  serviceName?: string;
  serviceDescription?: string;
  serviceCategory?: string;
  servicePriceHbar?: number;
  serviceId?: string;
  serviceInput?: string;
  // Task fields
  taskTitle?: string;
  taskDescription?: string;
  taskCategory?: string;
  taskBountyHbar?: number;
  taskId?: string;
  taskProposal?: string;
  taskDeadlineMinutes?: number;
  // Derivatives – options
  optionType?: "CALL" | "PUT";
  strikePrice?: number;
  sizeHbar?: number;
  premiumHbar?: number;
  optionId?: string;
  // Derivatives – perpetuals
  leverage?: number;
  positionSide?: "LONG" | "SHORT";
  positionId?: string;
  confidence: number;
  rationale: string;
}

export interface MarketSentimentMap {
  [marketId: string]: { [outcome: string]: number };
}

export interface GoalContext {
  bot: BaseAgent;
  markets: MarketSnapshot[];
  reputationByAccount?: Record<string, number>;
  marketSentiment?: MarketSentimentMap;
  lastFailedGoal?: ClawdbotGoal;
  personaPrompt?: string;
  derivativesContext?: string;
  searchContext?: string;
  recentActions?: string[];
  agentActivityFeed?: string;
  serviceCatalog?: string;
  taskBoard?: string;
}

export interface ActionContext {
  goal: ClawdbotGoal;
  bot: BaseAgent;
  markets: MarketSnapshot[];
  reputationByAccount?: Record<string, number>;
  marketSentiment?: MarketSentimentMap;
  lastFailedGoal?: ClawdbotGoal;
  personaPrompt?: string;
  derivativesContext?: string;
  searchContext?: string;
  agentActivityFeed?: string;
  serviceCatalog?: string;
  taskBoard?: string;
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

  async fulfillService(persona: string, serviceName: string, serviceDescription: string, userInput: string): Promise<string | null> {
    const prompt = [
      persona,
      "",
      `A customer has purchased your service "${serviceName}".`,
      `Service description: ${serviceDescription}`,
      "",
      "The customer's request:",
      userInput,
      "",
      "Provide a thorough, high-quality response that fulfills this service request.",
      "Be specific, data-driven, and actionable. Write as your persona — maintain your voice and expertise.",
      "Respond with the service output directly (plain text, no JSON wrapper)."
    ].join("\n");

    return this.#chatCompletion("ServiceFulfillment", [{ role: "user", content: prompt }], 0.7);
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
    const bettableMarkets = openMarkets.filter((m) => m.creatorAccountId !== context.bot.accountId);
    const ownCount = openMarkets.length - bettableMarkets.length;
    const sentimentLines = this.#formatSentimentForPrompt(openMarkets, context.marketSentiment);

    const personaPreamble = context.personaPrompt
      ? `${context.personaPrompt}\n\n`
      : `You are "${context.bot.name}", an autonomous prediction market trader on the Simulacrum platform (Hedera testnet).\n`;

    const existingMarketsList = openMarkets.length > 0
      ? openMarkets.map((m) => `  - "${m.question}"`).join("\n")
      : "  (none yet)";

    const recentActions = context.recentActions ?? [];

    const prompt = [
      personaPreamble,
      "You create prediction markets about real-world events and make informed bets on markets created by other agents. You trade with real HBAR.",
      "",
      "RULE: You CANNOT bet on or place orders on markets you created. Only on markets by OTHER agents.",
      "",
      context.searchContext
        ? `CURRENT NEWS & EVENTS (use these to create relevant, timely markets):\n${context.searchContext}\n`
        : "",
      "=== MARKETS ===",
      "- CREATE_MARKET: Create a prediction market about a REAL current event. Must be specific, verifiable, with a timeframe. Must differ from existing markets below.",
      "- PLACE_BET: Bet HBAR on another agent's market. Size by conviction (1 HBAR speculative, 3-5 HBAR strong).",
      "- PUBLISH_ORDER: Post BID/ASK limit orders for precise price exposure.",
      "",
      "=== DERIVATIVES (use these to express leveraged views or earn premium income) ===",
      "- WRITE_OPTION: Sell a CALL or PUT option on any open market. You earn premium upfront. CALL = you bet the outcome won't exceed the strike. PUT = you bet it will.",
      "- BUY_OPTION: Buy an existing option from the list below. Small premium = large leveraged exposure.",
      "- OPEN_POSITION: Open a leveraged perpetual (LONG or SHORT, 1-10×). LONG = probability rises → profit. SHORT = probability falls → profit.",
      "- CLOSE_POSITION: Close an existing perpetual to realize P&L.",
      "",
      "=== AGENT ECONOMY (interact with other agents directly) ===",
      "- REGISTER_SERVICE: Offer a service (ORACLE, DATA, RESEARCH, ANALYSIS, COMPUTE). Set a price. Other agents will see it and can request it.",
      "- REQUEST_SERVICE: Buy a service from another agent. Check the service catalog below for available services with their IDs.",
      "- CREATE_TASK: Post a bounty task for other agents to bid on and complete.",
      "- BID_TASK: Bid on a task posted by another agent. Check the task board below.",
      "",
      "- WAIT: Skip this turn if you acted recently or no opportunity exists.",
      "",
      recentActions.length > 0
        ? `YOUR RECENT ACTIONS (last ${recentActions.length}):\n${recentActions.map((a) => `  - ${a}`).join("\n")}\nVary your actions — don't repeat the same type every turn.\n`
        : "",
      "",
      `EXISTING OPEN MARKETS (do NOT duplicate these topics):\n${existingMarketsList}`,
      "",
      context.agentActivityFeed ? `\nWHAT OTHER AGENTS ARE DOING (react to this — collaborate, compete, or build on their moves):\n${context.agentActivityFeed}` : "",
      context.serviceCatalog ? `\nSERVICES YOU CAN REQUEST (use REQUEST_SERVICE with the serviceId):\n${context.serviceCatalog}` : "",
      context.taskBoard ? `\nOPEN TASKS YOU CAN BID ON (use BID_TASK with the taskId):\n${context.taskBoard}` : "",
      "",
      `Your bankroll: ${context.bot.bankrollHbar} HBAR`,
      `Markets by others (you CAN bet on): ${bettableMarkets.length}`,
      `Your own markets (you CANNOT bet on): ${ownCount}`,
      sentimentLines ? `\nMARKET SENTIMENT:\n${sentimentLines}` : "",
      context.derivativesContext ? `\n${context.derivativesContext}` : "",
      context.lastFailedGoal
        ? `\nLAST GOAL FAILED: "${context.lastFailedGoal.title}" — Error: ${context.lastFailedGoal.error ?? "unknown"}. Try a different approach.`
        : "",
      "",
      "Produce a single goal with a title and detail.",
      "Return JSON only, no markdown fences: {\"title\": string, \"detail\": string}."
    ].filter(Boolean).join("\n");

    const raw = await this.#chatCompletion("Goal", [{ role: "user", content: prompt }], 0.8);

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
    const bettableMarkets = openMarkets.filter((m) => m.creatorAccountId !== context.bot.accountId);
    const ownMarkets = openMarkets.filter((m) => m.creatorAccountId === context.bot.accountId);
    const marketLines = bettableMarkets.map((m) => {
      const sentimentData = context.marketSentiment?.[m.id];
      const sentimentStr = sentimentData
        ? ` | sentiment: ${Object.entries(sentimentData).map(([o, v]) => `${o}=${(v * 100).toFixed(0)}%`).join(", ")}`
        : "";
      return `  ${m.id}: "${m.question}" [${m.outcomes.join("/")}]${sentimentStr}`;
    }).join("\n");
    const bettableInfo = bettableMarkets.length > 0 ? `\n${marketLines}` : "none";
    const ownMarketInfo = ownMarkets.length > 0
      ? ownMarkets.map((m) => `  ${m.id}: "${m.question}"`).join("\n")
      : "none";

    const personaPreamble = context.personaPrompt
      ? `${context.personaPrompt}\n`
      : `You are "${context.bot.name}", a prediction market trader on the Simulacrum platform (Hedera testnet).\n`;

    const prompt = [
      personaPreamble,
      "RULE: You CANNOT bet on or place orders on your own markets. Only on markets created by OTHER agents.",
      "",
      context.searchContext
        ? `RESEARCH CONTEXT (use this to inform your decision):\n${context.searchContext}\n`
        : "",
      "Pick ONE action to execute your goal. All actions are equally valid — choose what best fits your goal.",
      "",
      "=== MARKETS ===",
      "CREATE_MARKET: Provide \"prompt\" (verifiable question WITH timeframe) and \"initialOddsByOutcome\" (e.g. {\"YES\": 65, \"NO\": 35}). Must differ from existing markets.",
      "PLACE_BET: Provide marketId, outcome, amountHbar (1-5). If sentiment is >65% one side, the other side is underpriced.",
      "PUBLISH_ORDER: Provide marketId, outcome, side (BID/ASK), quantity (1-50), price (0.01-0.99).",
      "",
      "=== DERIVATIVES ===",
      "WRITE_OPTION: Provide marketId, outcome, optionType (CALL/PUT), strikePrice (0.01-0.99), sizeHbar (1-10), premiumHbar (0.1-5). You sell the option and earn premium. Use on any open market.",
      "BUY_OPTION: Provide optionId from the available options list below. You pay the premium for leveraged exposure.",
      "OPEN_POSITION: Provide marketId, outcome, positionSide (LONG/SHORT), sizeHbar (1-10), leverage (1-10). Opens a perpetual with margin. Use on any open market.",
      "CLOSE_POSITION: Provide positionId from your open positions below. Closes position and realizes P&L.",
      "",
      "=== AGENT ECONOMY ===",
      "REGISTER_SERVICE: Provide serviceName, serviceDescription, serviceCategory (ORACLE/DATA/RESEARCH/ANALYSIS/COMPUTE/CUSTOM), servicePriceHbar.",
      "REQUEST_SERVICE: Provide serviceId (from catalog below) and serviceInput (what you need).",
      "CREATE_TASK: Provide taskTitle, taskDescription, taskCategory (RESEARCH/ANALYSIS/PREDICTION/DATA_COLLECTION/DEVELOPMENT/CUSTOM), taskBountyHbar, taskDeadlineMinutes.",
      "BID_TASK: Provide taskId (from board below), taskProposal (your plan), amountHbar (your bid price).",
      "",
      "WAIT: Skip this turn only if nothing is compelling.",
      "",
      "Return JSON only, no markdown fences:",
      "{\"type\": string, \"marketId\"?: string, \"outcome\"?: string, \"side\"?: \"BID\"|\"ASK\", \"quantity\"?: number, \"price\"?: number, \"amountHbar\"?: number, \"prompt\"?: string, \"initialOddsByOutcome\"?: {\"OUTCOME\": number}, \"optionType\"?: \"CALL\"|\"PUT\", \"strikePrice\"?: number, \"sizeHbar\"?: number, \"premiumHbar\"?: number, \"optionId\"?: string, \"leverage\"?: number, \"positionSide\"?: \"LONG\"|\"SHORT\", \"positionId\"?: string, \"serviceName\"?: string, \"serviceDescription\"?: string, \"serviceCategory\"?: string, \"servicePriceHbar\"?: number, \"serviceId\"?: string, \"serviceInput\"?: string, \"taskTitle\"?: string, \"taskDescription\"?: string, \"taskCategory\"?: string, \"taskBountyHbar\"?: number, \"taskId\"?: string, \"taskProposal\"?: string, \"taskDeadlineMinutes\"?: number, \"confidence\": number, \"rationale\": string}",
      "",
      context.agentActivityFeed ? `\nOTHER AGENTS' RECENT MOVES (react to these):\n${context.agentActivityFeed}` : "",
      context.serviceCatalog ? `\nSERVICES CATALOG — use REQUEST_SERVICE with serviceId:\n${context.serviceCatalog}` : "",
      context.taskBoard ? `\nTASK BOARD — use BID_TASK with taskId:\n${context.taskBoard}` : "",
      context.derivativesContext ? `\nDERIVATIVES STATE:\n${context.derivativesContext}` : "",
      "",
      `Bankroll: ${context.bot.bankrollHbar} HBAR`,
      `Goal: ${context.goal.title} — ${context.goal.detail}`,
      `Bettable markets (created by others): ${bettableInfo}`,
      `Your own markets (cannot bet on): ${ownMarketInfo}`,
      context.lastFailedGoal
        ? `\nLAST GOAL FAILED: "${context.lastFailedGoal.title}" — "${context.lastFailedGoal.error ?? "unknown"}". Choose a different action or market.`
        : ""
    ].filter(Boolean).join("\n");

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
      "WRITE_OPTION",
      "BUY_OPTION",
      "OPEN_POSITION",
      "CLOSE_POSITION",
      "REGISTER_SERVICE",
      "REQUEST_SERVICE",
      "CREATE_TASK",
      "BID_TASK",
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
      serviceName: typeof parsed.serviceName === "string" ? parsed.serviceName : undefined,
      serviceDescription: typeof parsed.serviceDescription === "string" ? parsed.serviceDescription : undefined,
      serviceCategory: typeof parsed.serviceCategory === "string" ? parsed.serviceCategory : undefined,
      servicePriceHbar: typeof parsed.servicePriceHbar === "number" ? parsed.servicePriceHbar : undefined,
      serviceId: typeof parsed.serviceId === "string" ? parsed.serviceId : undefined,
      serviceInput: typeof parsed.serviceInput === "string" ? parsed.serviceInput : undefined,
      taskTitle: typeof parsed.taskTitle === "string" ? parsed.taskTitle : undefined,
      taskDescription: typeof parsed.taskDescription === "string" ? parsed.taskDescription : undefined,
      taskCategory: typeof parsed.taskCategory === "string" ? parsed.taskCategory : undefined,
      taskBountyHbar: typeof parsed.taskBountyHbar === "number" ? parsed.taskBountyHbar : undefined,
      taskId: typeof parsed.taskId === "string" ? parsed.taskId : undefined,
      taskProposal: typeof parsed.taskProposal === "string" ? parsed.taskProposal : undefined,
      taskDeadlineMinutes: typeof parsed.taskDeadlineMinutes === "number" ? parsed.taskDeadlineMinutes : undefined,
      optionType: parsed.optionType === "CALL" || parsed.optionType === "PUT" ? parsed.optionType : undefined,
      strikePrice: typeof parsed.strikePrice === "number" && parsed.strikePrice > 0 && parsed.strikePrice < 1 ? parsed.strikePrice : undefined,
      sizeHbar: typeof parsed.sizeHbar === "number" && parsed.sizeHbar > 0 ? parsed.sizeHbar : undefined,
      premiumHbar: typeof parsed.premiumHbar === "number" && parsed.premiumHbar > 0 ? parsed.premiumHbar : undefined,
      optionId: typeof parsed.optionId === "string" ? parsed.optionId : undefined,
      leverage: typeof parsed.leverage === "number" && parsed.leverage >= 1 ? Math.min(parsed.leverage, 20) : undefined,
      positionSide: parsed.positionSide === "LONG" || parsed.positionSide === "SHORT" ? parsed.positionSide : undefined,
      positionId: typeof parsed.positionId === "string" ? parsed.positionId : undefined,
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
