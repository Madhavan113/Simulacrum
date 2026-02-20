import { randomUUID } from "node:crypto";
import type {
  ResearchAgentProfile,
  ResearchFocusArea,
  ResearchObservation,
  ResearchPublication,
  ObservationWindow,
} from "@simulacrum/types";
import type { PipelineSnapshot, AnalysisResult, Hypothesis } from "./types.js";
import { FOCUS_AREA_EVENT_FILTERS, FOCUS_AREA_LABELS } from "./types.js";

export class DeepResearchAgent {
  readonly profile: ResearchAgentProfile;
  #pipeline: PipelineSnapshot | null = null;
  #analysisResult: AnalysisResult | null = null;
  #hypotheses: Hypothesis[] | null = null;
  #draft: Partial<ResearchPublication> | null = null;
  readonly #previousPublications: ResearchPublication[] = [];

  constructor(focusArea: ResearchFocusArea, model: string) {
    const id = randomUUID();
    this.profile = {
      id,
      name: `${FOCUS_AREA_LABELS[focusArea]} Researcher`,
      focusArea,
      model,
      observationCount: 0,
      publicationCount: 0,
      averageEvalScore: 0,
      createdAt: new Date().toISOString(),
    };
  }

  get pipeline(): PipelineSnapshot | null {
    return this.#pipeline;
  }

  get analysisResult(): AnalysisResult | null {
    return this.#analysisResult;
  }

  get hypotheses(): Hypothesis[] | null {
    return this.#hypotheses;
  }

  get draft(): Partial<ResearchPublication> | null {
    return this.#draft;
  }

  get previousPublicationTitles(): string[] {
    return this.#previousPublications.map((p) => p.title);
  }

  get previousFindings(): string[] {
    return this.#previousPublications.flatMap((p) =>
      p.findings.map((f) => f.claim)
    );
  }

  filterRelevantObservations(observations: ResearchObservation[]): ResearchObservation[] {
    const categories = FOCUS_AREA_EVENT_FILTERS[this.profile.focusArea];
    return observations.filter((o) => categories.includes(o.category));
  }

  hasEnoughData(observations: ResearchObservation[], minObservations: number): boolean {
    const relevant = this.filterRelevantObservations(observations);
    return relevant.length >= minObservations;
  }

  startPipeline(): PipelineSnapshot {
    const now = new Date().toISOString();
    const publicationId = randomUUID();

    this.#pipeline = {
      publicationId,
      stage: "COLLECTING",
      revisionCount: 0,
      startedAt: now,
      lastAdvancedAt: now,
    };

    this.#analysisResult = null;
    this.#hypotheses = null;
    this.#draft = null;

    this.profile.currentStage = "COLLECTING";
    return this.#pipeline;
  }

  advanceTo(stage: PipelineSnapshot["stage"]): void {
    if (!this.#pipeline) return;
    this.#pipeline.stage = stage;
    this.#pipeline.lastAdvancedAt = new Date().toISOString();
    this.profile.currentStage = stage;
  }

  setAnalysis(result: AnalysisResult): void {
    this.#analysisResult = result;
    if (this.#pipeline) {
      this.#pipeline.analysisResult = result;
    }
  }

  setHypotheses(hypotheses: Hypothesis[]): void {
    this.#hypotheses = hypotheses;
    if (this.#pipeline) {
      this.#pipeline.hypotheses = hypotheses;
    }
  }

  setDraft(draft: Partial<ResearchPublication>): void {
    this.#draft = draft;
  }

  incrementRevision(): void {
    if (this.#pipeline) {
      this.#pipeline.revisionCount += 1;
    }
  }

  completePipeline(publication: ResearchPublication): void {
    this.#previousPublications.push(publication);
    this.profile.publicationCount += 1;
    this.profile.observationCount += publication.dataWindow.observationCount;
    if (publication.evaluation) {
      const totalScore =
        this.profile.averageEvalScore * (this.profile.publicationCount - 1) +
        publication.evaluation.overallScore;
      this.profile.averageEvalScore = totalScore / this.profile.publicationCount;
    }

    this.#pipeline = null;
    this.#analysisResult = null;
    this.#hypotheses = null;
    this.#draft = null;
    this.profile.currentStage = undefined;
  }

  resetPipeline(): void {
    this.#pipeline = null;
    this.#analysisResult = null;
    this.#hypotheses = null;
    this.#draft = null;
    this.profile.currentStage = undefined;
  }

  buildPublicationShell(windows: ObservationWindow[]): Partial<ResearchPublication> {
    const allObs = windows.flatMap((w) => w.observations);
    const marketIds = [...new Set(allObs.map((o) => o.marketId).filter(Boolean))] as string[];

    return {
      id: this.#pipeline?.publicationId ?? randomUUID(),
      agentId: this.profile.id,
      focusArea: this.profile.focusArea,
      status: "COLLECTING",
      title: "",
      abstract: "",
      methodology: "",
      findings: [],
      conclusion: "",
      limitations: "",
      futureWork: "",
      dataWindow: {
        startTime: windows[0]?.startTime ?? new Date().toISOString(),
        endTime: windows[windows.length - 1]?.endTime ?? new Date().toISOString(),
        observationCount: allObs.length,
        marketIds,
      },
      previousPublicationIds: this.#previousPublications.map((p) => p.id),
      createdAt: new Date().toISOString(),
    };
  }
}
