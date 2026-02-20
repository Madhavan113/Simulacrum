import { randomUUID } from "node:crypto";
import type { PublicationEvaluation, EvalDimension, EvalTest } from "@simulacrum/types";

const DIMENSION_WEIGHTS: Record<keyof PublicationEvaluation["dimensions"], number> = {
  reproducibility: 0.25,
  statisticalSignificance: 0.10,
  novelty: 0.20,
  coherence: 0.20,
  evidenceBacking: 0.25,
  predictiveValidity: 0.00,
};

function emptyDimension(name: string): EvalDimension {
  return {
    score: 0,
    rationale: `${name}: not evaluated`,
    tests: [],
  };
}

function deferredDimension(): EvalDimension {
  return {
    score: 0,
    rationale: "Deferred to future phase — prediction extraction not yet implemented",
    tests: [{
      name: "deferred",
      description: "Predictive validity evaluation is deferred",
      passed: true,
      score: 0,
      details: "This dimension will be enabled when prediction extraction is implemented",
    }],
  };
}

export function mergeEvaluation(
  publicationId: string,
  deterministicScores: Partial<Record<keyof PublicationEvaluation["dimensions"], EvalDimension>>,
  llmScores: Partial<PublicationEvaluation> | null
): PublicationEvaluation {
  const llmDimensions = llmScores?.dimensions;

  const dimensions: PublicationEvaluation["dimensions"] = {
    reproducibility: deterministicScores.reproducibility ?? emptyDimension("reproducibility"),
    statisticalSignificance: deterministicScores.statisticalSignificance ?? emptyDimension("statisticalSignificance"),
    evidenceBacking: deterministicScores.evidenceBacking ?? emptyDimension("evidenceBacking"),
    novelty: llmDimensions?.novelty ?? emptyDimension("novelty"),
    coherence: llmDimensions?.coherence ?? emptyDimension("coherence"),
    predictiveValidity: deferredDimension(),
  };

  let weightedSum = 0;
  let totalWeight = 0;

  for (const [key, weight] of Object.entries(DIMENSION_WEIGHTS)) {
    const dim = dimensions[key as keyof typeof dimensions];
    if (weight > 0 && dim.score > 0) {
      weightedSum += dim.score * weight;
      totalWeight += weight;
    } else if (weight > 0) {
      totalWeight += weight;
    }
  }

  const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  let verdict: PublicationEvaluation["verdict"];
  if (overallScore >= 60) {
    verdict = "PASS";
  } else if (overallScore >= 50) {
    verdict = "MARGINAL";
  } else {
    verdict = "FAIL";
  }

  return {
    id: randomUUID(),
    publicationId,
    dimensions,
    overallScore,
    verdict,
    critiques: llmScores?.critiques ?? [],
    strengths: llmScores?.strengths ?? [],
    evaluatedAt: new Date().toISOString(),
    evaluatorModel: "hybrid-deterministic+grok-4-1-fast-reasoning",
  };
}
