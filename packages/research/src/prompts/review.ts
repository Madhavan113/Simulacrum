import type { ResearchPublication } from "@simulacrum/types";

export function buildReviewPrompt(publication: Partial<ResearchPublication>): string {
  return `You are an adversarial peer reviewer. Your job is to find weaknesses, not to be encouraging. Be cold, precise, and merciless.

REVIEW THIS DRAFT PUBLICATION:
${JSON.stringify(publication, null, 2)}

STRUCTURED REVIEW CHECKLIST — evaluate each point:
1. Does every finding cite specific on-chain data (market IDs, transaction references)?
2. Are confidence levels calibrated to evidence strength? (High confidence with weak evidence = fail)
3. Are there internal contradictions between findings?
4. Does the conclusion logically follow from the methodology and findings?
5. Are limitations honestly stated, or does the paper hide weaknesses?
6. Is the methodology reproducible — could another agent replicate this from the same data?
7. Is there anything claimed without evidence?
8. Is the sample size sufficient for the claims made?

SCORING RUBRIC — anchor your score to these bands:
  0-20:  Fundamentally flawed — missing data, fabricated references, incoherent argument
 20-40:  Major issues — multiple unsupported claims, poor methodology, contradictions
 40-55:  Below average — some valid points but significant gaps in evidence or logic
 55-70:  Acceptable — adequate evidence and methodology with notable weaknesses
 70-85:  Good — solid evidence, clear methodology, minor issues only
 85-100: Excellent — comprehensive evidence, rigorous methodology, honest limitations

Most drafts from a single automated pipeline should score 40-65. Scores above 75 require exceptional evidence depth. Do NOT default to high scores.

Return JSON only:
{
  "critiques": ["specific critique 1", "specific critique 2"],
  "suggestions": ["concrete improvement 1", "concrete improvement 2"],
  "overallAssessment": "Brief verdict on the draft quality",
  "score": 0-100
}`;
}
