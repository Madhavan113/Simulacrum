import type {
  AnalysisResult,
  Hypothesis,
  ReviewResult,
  XaiEngineConfig,
} from "./types.js";
import type {
  ObservationWindow,
  ResearchFocusArea,
  ResearchPublication,
  PublicationEvaluation,
  EvalDimension,
} from "@simulacrum/types";

import { buildAnalysisPrompt } from "./prompts/analysis.js";
import { buildHypothesisPrompt } from "./prompts/hypothesis.js";
import { buildSynthesisPrompt } from "./prompts/synthesis.js";
import { buildReviewPrompt } from "./prompts/review.js";
import { buildRevisionMessages } from "./prompts/revision.js";
import { buildEvalScoringPrompt } from "./prompts/eval-scoring.js";

const DEFAULT_MODEL = "grok-4-1-fast-reasoning";
const DEFAULT_BASE_URL = "https://api.x.ai/v1";
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 120_000;

function stripMarkdownFences(raw: string): string {
  const trimmed = raw.trim();

  // Anchored match: entire response is a fenced block
  const fullMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fullMatch) return fullMatch[1]!.trim();

  // Reasoning-model match: chain-of-thought preamble before the JSON fence
  const innerMatch = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
  if (innerMatch) return innerMatch[1]!.trim();

  // Last resort: extract the first top-level JSON object or array
  const jsonStart = trimmed.search(/[\[{]/);
  if (jsonStart >= 0) {
    const candidate = trimmed.slice(jsonStart);
    const endChar = candidate[0] === "[" ? "]" : "}";
    const endIdx = candidate.lastIndexOf(endChar);
    if (endIdx > 0) return candidate.slice(0, endIdx + 1);
  }

  return trimmed;
}

function parseJson<T>(raw: string): T | null {
  const cleaned = stripMarkdownFences(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    const preview = cleaned.slice(0, 200).replace(/\n/g, "\\n");
    console.error(
      `[xai-engine] JSON parse failed: ${err instanceof Error ? err.message : err} | preview: "${preview}"`
    );
    return null;
  }
}

export class XaiEngine {
  readonly #apiKey: string;
  readonly #model: string;
  readonly #baseUrl: string;
  readonly #maxRetries: number;
  readonly #timeoutMs: number;

  constructor(config: XaiEngineConfig) {
    this.#apiKey = config.apiKey;
    this.#model = config.model ?? DEFAULT_MODEL;
    this.#baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.#maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.#timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  get configured(): boolean {
    return !!this.#apiKey;
  }

  async analyzeObservations(
    windows: ObservationWindow[],
    focusArea: ResearchFocusArea,
    previousFindings?: string[]
  ): Promise<AnalysisResult | null> {
    const prompt = buildAnalysisPrompt(windows, focusArea, previousFindings);
    const raw = await this.#chatCompletion("Analysis", prompt, 0.3);
    if (!raw) return null;

    const parsed = parseJson<AnalysisResult>(raw);
    if (!parsed?.patterns || !Array.isArray(parsed.patterns)) return null;

    return {
      patterns: parsed.patterns,
      anomalies: parsed.anomalies ?? [],
      summary: parsed.summary ?? "",
    };
  }

  async generateHypotheses(
    analysis: AnalysisResult,
    focusArea: ResearchFocusArea,
    previousPublicationTitles?: string[]
  ): Promise<Hypothesis[] | null> {
    const prompt = buildHypothesisPrompt(analysis, focusArea, previousPublicationTitles);
    const raw = await this.#chatCompletion("Hypothesis", prompt, 0.5);
    if (!raw) return null;

    const parsed = parseJson<{ hypotheses: Hypothesis[] }>(raw);
    return parsed?.hypotheses ?? parseJson<Hypothesis[]>(raw);
  }

  async synthesizePublication(
    hypotheses: Hypothesis[],
    windows: ObservationWindow[],
    focusArea: ResearchFocusArea
  ): Promise<Partial<ResearchPublication> | null> {
    const prompt = buildSynthesisPrompt(hypotheses, windows, focusArea);
    const raw = await this.#chatCompletion("Synthesis", prompt, 0.4);
    if (!raw) return null;

    return parseJson<Partial<ResearchPublication>>(raw);
  }

  async selfReview(
    publication: Partial<ResearchPublication>
  ): Promise<ReviewResult | null> {
    const prompt = buildReviewPrompt(publication);
    const raw = await this.#chatCompletion("SelfReview", prompt, 0.2);
    if (!raw) return null;

    return parseJson<ReviewResult>(raw);
  }

  async revise(
    publication: Partial<ResearchPublication>,
    review: ReviewResult
  ): Promise<Partial<ResearchPublication> | null> {
    const messages = buildRevisionMessages(publication, review);
    const raw = await this.#chatCompletionMessages("Revision", messages, 0.4);
    if (!raw) return null;
    return parseJson<Partial<ResearchPublication>>(raw);
  }

  async scorePublication(
    publication: ResearchPublication,
    deterministicScores: Partial<Record<keyof PublicationEvaluation["dimensions"], EvalDimension>>
  ): Promise<Partial<PublicationEvaluation> | null> {
    const prompt = buildEvalScoringPrompt(publication, deterministicScores);
    const raw = await this.#chatCompletion("EvalScoring", prompt, 0.1);
    if (!raw) return null;
    return parseJson<Partial<PublicationEvaluation>>(raw);
  }

  async #chatCompletion(
    label: string,
    userContent: string,
    temperature: number
  ): Promise<string | null> {
    return this.#chatCompletionMessages(
      label,
      [{ role: "user", content: userContent }],
      temperature
    );
  }

  async #chatCompletionMessages(
    label: string,
    messages: Array<{ role: string; content: string }>,
    temperature: number
  ): Promise<string | null> {
    if (!this.#apiKey) {
      console.warn(`[xai-engine] No API key — skipping ${label}.`);
      return null;
    }

    const url = `${this.#baseUrl}/chat/completions`;

    for (let attempt = 0; attempt <= this.#maxRetries; attempt++) {
      console.log(`[xai-engine] ${label} → model=${this.#model} attempt=${attempt + 1}`);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.#timeoutMs);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.#apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.#model,
            temperature,
            messages,
          }),
          signal: controller.signal,
        });

        if (response.status === 429) {
          const retryAfter = Number(response.headers.get("retry-after") || 5);
          console.warn(`[xai-engine] ${label} rate-limited, waiting ${retryAfter}s...`);
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          continue;
        }

        if (response.status >= 500) {
          const backoff = Math.min(2 ** attempt * 1000, 30_000);
          console.warn(`[xai-engine] ${label} server error ${response.status}, retrying in ${backoff}ms...`);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          console.error(`[xai-engine] ${label} failed: HTTP ${response.status} — ${body}`);
          return null;
        }

        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = payload.choices?.[0]?.message?.content;

        if (!content) {
          console.warn(`[xai-engine] ${label} returned empty content.`);
          return null;
        }

        console.log(`[xai-engine] ${label} succeeded (${content.length} chars)`);
        return content;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          console.error(`[xai-engine] ${label} timed out after ${this.#timeoutMs}ms`);
        } else {
          console.error(`[xai-engine] ${label} error: ${error instanceof Error ? error.message : error}`);
        }

        if (attempt < this.#maxRetries) {
          const backoff = Math.min(2 ** attempt * 1000, 30_000);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
      } finally {
        clearTimeout(timer);
      }
    }

    console.error(`[xai-engine] ${label} failed: all retries exhausted.`);
    return null;
  }
}
