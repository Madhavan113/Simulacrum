import type { ResearchPublication, PublicationEvaluation, EvalDimension } from "@simulacrum/types";

export function buildEvalScoringPrompt(
  publication: ResearchPublication,
  deterministicScores: Partial<Record<keyof PublicationEvaluation["dimensions"], EvalDimension>>
): string {
  const detScores = Object.entries(deterministicScores)
    .map(([dim, val]) => `${dim}: ${val.score}/100 — ${val.rationale}`)
    .join("\n");

  return `You are an impartial evaluator scoring a research publication. Some dimensions have already been scored by deterministic checks. You need to score the REMAINING dimensions.

PUBLICATION:
Title: ${publication.title}
Focus Area: ${publication.focusArea}
Abstract: ${publication.abstract}
Methodology: ${publication.methodology}
Findings: ${JSON.stringify(publication.findings)}
Conclusion: ${publication.conclusion}
Limitations: ${publication.limitations}

ALREADY SCORED (deterministic — do not re-score these):
${detScores || "None yet"}

SCORE THESE DIMENSIONS:

1. NOVELTY (weight 20%):
   - Is this saying something genuinely new vs. restating known patterns?
   - 0-20: Restating prior findings
   - 20-50: Incremental extension
   - 50-75: New framing of known patterns
   - 75-100: Genuinely novel finding

2. COHERENCE (weight 20%):
   - Does methodology → findings → conclusion flow logically?
   - Are there internal contradictions?
   - Does the abstract accurately reflect the content?

Return JSON only:
{
  "dimensions": {
    "novelty": {
      "score": 0-100,
      "rationale": "explanation",
      "tests": [
        {"name": "test name", "description": "what it checks", "passed": true/false, "score": 0-100, "details": "specifics"}
      ]
    },
    "coherence": {
      "score": 0-100,
      "rationale": "explanation",
      "tests": [
        {"name": "test name", "description": "what it checks", "passed": true/false, "score": 0-100, "details": "specifics"}
      ]
    }
  },
  "critiques": ["weakness 1", "weakness 2"],
  "strengths": ["strength 1", "strength 2"]
}`;
}
