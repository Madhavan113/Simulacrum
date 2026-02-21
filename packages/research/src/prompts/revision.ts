import type { ResearchPublication } from "@simulacrum/types";
import type { ReviewResult } from "../types.js";

export function buildRevisionMessages(
  publication: Partial<ResearchPublication>,
  review: ReviewResult
): Array<{ role: "system" | "user"; content: string }> {
  const critiquesFormatted = review.critiques
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");

  const suggestionsFormatted = review.suggestions
    .map((s, i) => `${i + 1}. ${s}`)
    .join("\n");

  return [
    {
      role: "system",
      content: `You are a rigorous research editor revising a publication draft about autonomous agent prediction markets on Hedera (Simulacrum platform).

REVISION RULES:
1. Address EVERY critique listed below — do not skip any
2. Incorporate suggestions where they improve quality
3. PRESERVE all existing on-chain references (entityId, hashScanUrl) — do not fabricate new ones
4. PRESERVE the original publication schema exactly — same field names, same types
5. Do NOT inflate confidence levels unless new evidence justifies it
6. Keep the same title unless a critique specifically targets it
7. Limitations section must remain honest — do not remove acknowledged weaknesses
8. If a critique cannot be fully addressed, acknowledge it in the limitations

Return the COMPLETE revised publication as a single JSON object with the same schema as the input draft.`,
    },
    {
      role: "user",
      content: `DRAFT PUBLICATION:
${JSON.stringify(publication, null, 2)}

PEER REVIEW CRITIQUES:
${critiquesFormatted}

REVIEWER SUGGESTIONS:
${suggestionsFormatted}

REVIEW SCORE: ${review.score}/100
OVERALL ASSESSMENT: ${review.overallAssessment}

Revise the draft to address these issues. Return the complete revised publication as JSON.`,
    },
  ];
}
