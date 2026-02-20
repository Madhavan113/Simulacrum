import {
  DataCollector,
  DeepResearchAgent,
  XaiEngine,
  advancePipeline,
  getResearchStore,
  persistResearchStore,
} from "@simulacrum/research";
import type { ResearchEngineStatus, ResearchFocusArea } from "@simulacrum/research";
import { getMarketStore } from "@simulacrum/markets";
import { getReputationStore } from "@simulacrum/reputation";
import type { ApiEventBus } from "../events.js";

const DEFAULT_TICK_MS = 60_000;
const DEFAULT_AGENT_COUNT = 3;
const DEFAULT_PUBLICATION_INTERVAL_TICKS = 10;
const DEFAULT_MIN_OBSERVATIONS = 30;
const DEFAULT_EVAL_THRESHOLD = 60;

const FOCUS_AREAS: ResearchFocusArea[] = [
  "agential_game_theory",
  "reputation_systems",
  "market_microstructure",
  "agent_coordination",
  "oracle_reliability",
  "agent_native_economics",
];

export interface ResearchEngineOptions {
  eventBus: ApiEventBus;
  enabled?: boolean;
  tickMs?: number;
  agentCount?: number;
  publicationIntervalTicks?: number;
  minObservations?: number;
  evalThreshold?: number;
  xaiApiKey?: string;
  xaiModel?: string;
  xaiBaseUrl?: string;
  xaiMaxRetries?: number;
  xaiTimeoutMs?: number;
}

export class ResearchEngine {
  readonly #eventBus: ApiEventBus;
  readonly #enabled: boolean;
  readonly #tickMs: number;
  readonly #targetAgents: number;
  readonly #publicationIntervalTicks: number;
  readonly #minObservations: number;
  readonly #evalThreshold: number;

  readonly #collector: DataCollector;
  readonly #xai: XaiEngine;
  readonly #agents: DeepResearchAgent[] = [];

  #interval: ReturnType<typeof setInterval> | null = null;
  #running = false;
  #starting = false;
  #tickCount = 0;
  #lastTickAt: Date | null = null;
  #lastError: string | null = null;
  #activeTick = false;
  #hydrated = false;
  #totalObservations = 0;

  constructor(options: ResearchEngineOptions) {
    this.#eventBus = options.eventBus;
    this.#enabled = options.enabled ?? false;
    this.#tickMs = options.tickMs ?? DEFAULT_TICK_MS;
    this.#targetAgents = options.agentCount ?? DEFAULT_AGENT_COUNT;
    this.#publicationIntervalTicks = options.publicationIntervalTicks ?? DEFAULT_PUBLICATION_INTERVAL_TICKS;
    this.#minObservations = options.minObservations ?? DEFAULT_MIN_OBSERVATIONS;
    this.#evalThreshold = options.evalThreshold ?? DEFAULT_EVAL_THRESHOLD;

    this.#collector = new DataCollector();
    this.#xai = new XaiEngine({
      apiKey: options.xaiApiKey ?? "",
      model: options.xaiModel ?? "grok-4-1-fast-reasoning",
      baseUrl: options.xaiBaseUrl ?? "https://api.x.ai/v1",
      maxRetries: options.xaiMaxRetries ?? 3,
      timeoutMs: options.xaiTimeoutMs ?? 120_000,
    });
  }

  getStatus(): ResearchEngineStatus {
    const store = getResearchStore();
    const publications = Array.from(store.publications.values());
    const published = publications.filter((p) => p.status === "PUBLISHED");
    const retracted = publications.filter((p) => p.status === "RETRACTED");

    const evalScores = published
      .map((p) => p.evaluation?.overallScore)
      .filter((s): s is number => s !== undefined);
    const avgScore = evalScores.length > 0
      ? evalScores.reduce((a, b) => a + b, 0) / evalScores.length
      : 0;

    return {
      enabled: this.#enabled,
      running: this.#running,
      tickMs: this.#tickMs,
      tickCount: this.#tickCount,
      agentCount: this.#agents.length,
      totalObservations: this.#totalObservations,
      totalPublications: publications.length,
      publishedCount: published.length,
      retractedCount: retracted.length,
      averageEvalScore: Math.round(avgScore),
      activeAgents: this.#agents.map((a) => a.profile),
      lastTickAt: this.#lastTickAt?.toISOString(),
      lastError: this.#lastError ?? undefined,
    };
  }

  async start(): Promise<void> {
    if (!this.#enabled || this.#running || this.#starting) return;
    this.#starting = true;

    try {
      if (!this.#xai.configured) {
        console.warn("[research-engine] No xAI API key configured — research engine will not produce publications.");
      }

      this.#hydrateFromStores();
      this.#collector.subscribe(this.#eventBus);
      this.#ensureAgents();
      this.#clearStalePipelines();

      this.#running = true;
      await this.runTick();

      this.#interval = setInterval(() => {
        void this.runTick();
      }, this.#tickMs);

      this.#eventBus.publish("research.started", {
        agentCount: this.#agents.length,
        tickMs: this.#tickMs,
      });
    } finally {
      this.#starting = false;
    }
  }

  async stop(): Promise<void> {
    if (!this.#running) return;

    if (this.#interval) {
      clearInterval(this.#interval);
      this.#interval = null;
    }

    this.#collector.unsubscribe();
    this.#running = false;

    persistResearchStore();

    this.#eventBus.publish("research.stopped", { reason: "manual" });
  }

  async runTick(): Promise<void> {
    if (!this.#enabled || this.#activeTick) return;
    this.#activeTick = true;

    try {
      this.#tickCount += 1;
      const now = new Date();

      const window = this.#collector.flush();
      this.#totalObservations += window.observations.length;

      this.#eventBus.publish("research.tick", {
        tickCount: this.#tickCount,
        observationCount: window.observations.length,
        activePipelines: this.#agents.filter((a) => a.pipeline).length,
      });

      if (window.observations.length > 0) {
        this.#eventBus.publish("research.observation.batch", {
          count: window.observations.length,
          categories: [...new Set(window.observations.map((o) => o.category))],
        });
      }

      const recentWindows = this.#collector.recentWindows(5);
      const allRecentObs = recentWindows.flatMap((w) => w.observations);

      for (const agent of this.#agents) {
        if (agent.pipeline) {
          const result = await advancePipeline(
            agent,
            recentWindows,
            this.#xai,
            this.#evalThreshold,
            () => getMarketStore()
          );

          if (result.advanced) {
            this.#eventBus.publish("research.pipeline.advanced", {
              publicationId: agent.pipeline?.publicationId ?? "completed",
              agentId: agent.profile.id,
              stage: result.stage,
              focusArea: agent.profile.focusArea,
            });

            if ((result.stage === "PUBLISHED" || result.stage === "RETRACTED") && result.publication) {
              const store = getResearchStore();
              const pub = result.publication;
              store.publications.set(pub.id, pub);
              if (pub.evaluation) store.evaluations.set(pub.evaluation.id, pub.evaluation);
              persistResearchStore(store);

              if (result.stage === "PUBLISHED") {
                this.#eventBus.publish("research.publication.published", { publication: pub });
                this.#eventBus.publish("research.evaluation.complete", {
                  publicationId: pub.id,
                  overallScore: pub.evaluation?.overallScore ?? 0,
                  verdict: pub.evaluation?.verdict ?? "FAIL",
                });
              } else {
                this.#eventBus.publish("research.publication.retracted", {
                  publicationId: pub.id,
                  reason: pub.retractedReason ?? "below threshold",
                  score: pub.evaluation?.overallScore ?? 0,
                });
              }
            }
          }

          this.#savePipelineState(agent);
        } else if (
          this.#tickCount % this.#publicationIntervalTicks === 0 &&
          agent.hasEnoughData(allRecentObs, this.#minObservations)
        ) {
          agent.startPipeline();
          this.#savePipelineState(agent);

          this.#eventBus.publish("research.pipeline.advanced", {
            publicationId: agent.pipeline!.publicationId,
            agentId: agent.profile.id,
            stage: "COLLECTING",
            focusArea: agent.profile.focusArea,
          });
        }
      }

      this.#lastTickAt = now;
      this.#lastError = null;
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error);
      console.error("[research-engine] tick error:", this.#lastError);
    } finally {
      this.#activeTick = false;
    }
  }

  #hydrateFromStores(): void {
    if (this.#hydrated) return;

    try {
      const marketStore = getMarketStore();
      this.#collector.hydrateFromMarketStore(marketStore);
    } catch (e) {
      console.warn("[research-engine] Could not hydrate from market store:", e);
    }

    try {
      const repStore = getReputationStore();
      this.#collector.hydrateFromReputationStore(repStore);
    } catch (e) {
      console.warn("[research-engine] Could not hydrate from reputation store:", e);
    }

    this.#collector.sortBuffer();
    this.#hydrated = true;
    this.#totalObservations = this.#collector.bufferSize;
    console.log(`[research-engine] Hydrated ${this.#totalObservations} observations from stores`);
  }

  #ensureAgents(): void {
    const store = getResearchStore();

    if (store.agentProfiles.size > 0 && this.#agents.length === 0) {
      for (const [, profile] of store.agentProfiles) {
        const agent = new DeepResearchAgent(profile.focusArea, profile.model);
        Object.assign(agent.profile, profile);
        this.#agents.push(agent);
      }
    }

    while (this.#agents.length < this.#targetAgents) {
      const focusArea = FOCUS_AREAS[this.#agents.length % FOCUS_AREAS.length]!;
      const agent = new DeepResearchAgent(focusArea, this.#xai.configured ? "grok-4-1-fast-reasoning" : "none");
      this.#agents.push(agent);
      store.agentProfiles.set(agent.profile.id, agent.profile);
    }

    persistResearchStore(store);
  }

  #clearStalePipelines(): void {
    const store = getResearchStore();
    for (const agent of this.#agents) {
      const snapshot = store.pipelines.get(agent.profile.id);
      if (snapshot && snapshot.stage !== "PUBLISHED" && snapshot.stage !== "RETRACTED") {
        agent.resetPipeline();
        store.pipelines.delete(agent.profile.id);
      }
    }
    persistResearchStore(store);
  }

  #savePipelineState(agent: DeepResearchAgent): void {
    const store = getResearchStore();
    if (agent.pipeline) {
      store.pipelines.set(agent.profile.id, agent.pipeline);
    } else {
      store.pipelines.delete(agent.profile.id);
    }
    store.agentProfiles.set(agent.profile.id, agent.profile);
    persistResearchStore(store);
  }
}

export function createResearchEngine(options: ResearchEngineOptions): ResearchEngine {
  return new ResearchEngine(options);
}
