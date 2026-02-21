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
   - 0-20:  Restating prior findings or obvious facts about prediction markets
   - 20-40: Minor variation on well-known patterns
   - 40-60: Incremental extension with some new angle
   - 60-80: New framing that generates testable predictions
   - 80-100: Genuinely novel finding with clear implications
   Most automated research outputs should score 30-55. Score above 70 only if the finding would surprise a domain expert.

2. COHERENCE (weight 20%):
   - Does methodology → findings → conclusion flow logically?
   - Are there internal contradictions?
   - Does the abstract accurately reflect the content?
   - 0-20:  Incoherent — findings contradict each other or the conclusion
   - 20-40: Weak — logical gaps between methodology and claims
   - 40-60: Adequate — generally follows but with loose connections
   - 60-80: Good — clear logical chain with minor gaps
   - 80-100: Rigorous — every claim follows from stated evidence
   Most automated drafts should score 40-65. Score above 75 only with tight end-to-end logical consistency.

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
