import type {
  EvalDimension,
  ObservationCategory,
  PublicationFinding,
  PublicationStatus,
  ResearchFocusArea,
  ResearchObservation,
  ObservationWindow,
  WindowSummary,
  ResearchAgentProfile,
  ResearchPublication,
  PublicationEvaluation,
  OnChainReference,
} from "@simulacrum/types";

import {
  RESEARCH_FOCUS_LABELS,
  RESEARCH_FOCUS_SHORT_LABELS,
} from "@simulacrum/types";

export type {
  EvalDimension,
  ObservationCategory,
  PublicationFinding,
  PublicationStatus,
  ResearchFocusArea,
  ResearchObservation,
  ObservationWindow,
  WindowSummary,
  ResearchAgentProfile,
  ResearchPublication,
  PublicationEvaluation,
  OnChainReference,
};

// ── Internal pipeline types (not exported from @simulacrum/types) ──

export interface AnalysisPattern {
  description: string;
  category: ObservationCategory;
  supportingObservationIds: string[];
  metrics: Record<string, number>;
  significance: number;
}

export interface AnalysisAnomaly {
  description: string;
  observationId: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  details: string;
}

export interface AnalysisResult {
  patterns: AnalysisPattern[];
  anomalies: AnalysisAnomaly[];
  summary: string;
}

export interface Hypothesis {
  id: string;
  claim: string;
  testability: number;
  novelty: number;
  supportingPatterns: string[];
  requiredData: string[];
}

export interface ReviewResult {
  critiques: string[];
  suggestions: string[];
  overallAssessment: string;
  score: number;
}

export interface PipelineSnapshot {
  publicationId: string;
  stage: PublicationStatus;
  analysisResult?: AnalysisResult;
  hypotheses?: Hypothesis[];
  reviewCritiques?: string[];
  revisionCount: number;
  startedAt: string;
  lastAdvancedAt: string;
}

export interface XaiEngineConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxRetries?: number;
  timeoutMs?: number;
}

export const FOCUS_AREA_LABELS = RESEARCH_FOCUS_LABELS;
export const FOCUS_AREA_SHORT_LABELS = RESEARCH_FOCUS_SHORT_LABELS;

export const FOCUS_AREA_EVENT_FILTERS: Record<ResearchFocusArea, ObservationCategory[]> = {
  agential_game_theory: ["price_movement", "agent_strategy", "liquidity_event", "anomaly"],
  reputation_systems: ["reputation_change", "dispute_resolution", "agent_strategy"],
  agent_coordination: ["market_creation", "coordination_signal", "agent_strategy", "anomaly"],
  market_microstructure: ["liquidity_event", "price_movement", "market_creation"],
  oracle_reliability: ["dispute_resolution", "reputation_change"],
  agent_native_economics: ["price_movement", "liquidity_event", "market_creation", "reputation_change"],
};
