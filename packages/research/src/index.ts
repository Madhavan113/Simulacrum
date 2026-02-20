export type {
  ResearchEngineStatus,
  ResearchFocusArea,
  ResearchAgentProfile,
  ResearchPublication,
  PublicationEvaluation,
  ResearchObservation,
  ObservationWindow,
  PublicationStatus,
} from "@simulacrum/types";

export {
  RESEARCH_FOCUS_LABELS,
  RESEARCH_FOCUS_SHORT_LABELS,
} from "@simulacrum/types";

export {
  type AnalysisPattern,
  type AnalysisAnomaly,
  type AnalysisResult,
  type Hypothesis,
  type ReviewResult,
  type PipelineSnapshot,
  type XaiEngineConfig,
  FOCUS_AREA_LABELS,
  FOCUS_AREA_SHORT_LABELS,
  FOCUS_AREA_EVENT_FILTERS,
} from "./types.js";

export { XaiEngine } from "./xai-engine.js";
export { DataCollector } from "./collector.js";
export { createWindow, computeSummary, createEmptySummary } from "./observation-window.js";
export { DeepResearchAgent } from "./research-agent.js";
export { advancePipeline, type PipelineAdvanceResult } from "./publication-engine.js";
export { runDeterministicEval } from "./deterministic-eval.js";
export { mergeEvaluation } from "./evaluation.js";

export {
  getResearchStore,
  persistResearchStore,
  resetResearchStoreForTests,
  type ResearchStore,
} from "./store.js";
