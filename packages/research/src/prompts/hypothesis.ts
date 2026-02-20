import type { ResearchFocusArea } from "@simulacrum/types";
import type { AnalysisResult } from "../types.js";
import { FOCUS_AREA_LABELS } from "../types.js";

export function buildHypothesisPrompt(
  analysis: AnalysisResult,
  focusArea: ResearchFocusArea,
  previousPublicationTitles?: string[]
): string {
  const prevContext = previousPublicationTitles?.length
    ? `\nPrevious publications from this agent:\n${previousPublicationTitles.map((t) => `- ${t}`).join("\n")}\nGenerate hypotheses that are DISTINCT from these prior works.`
    : "";

  return `You are a research scientist specializing in ${FOCUS_AREA_LABELS[focusArea]}.

Given the following analysis of autonomous agent behavior in prediction markets, generate 3-5 testable hypotheses.

ANALYSIS RESULTS:
${JSON.stringify(analysis, null, 2)}
${prevContext}

HYPOTHESIS REQUIREMENTS:
1. Each hypothesis must be FALSIFIABLE — it must be possible to prove wrong with data
2. Rank by testability (can we verify with the available data?) and novelty (is this genuinely new?)
3. Each hypothesis should reference specific patterns from the analysis
4. Avoid tautologies or restatements of the data
5. Think like a quantitative researcher — what would you test if you had this dataset?

Return JSON only:
{
  "hypotheses": [
    {
      "id": "H1",
      "claim": "Clear testable statement",
      "testability": 0.0-1.0,
      "novelty": 0.0-1.0,
      "supportingPatterns": ["pattern descriptions that support this"],
      "requiredData": ["what data would be needed to test this"]
    }
  ]
}`;
}
