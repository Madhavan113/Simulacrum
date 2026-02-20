import type { ResearchPublication } from "@simulacrum/types";

export function buildEvalGenerationPrompt(publication: ResearchPublication): string {
  return `You are an evaluation suite designer. Given a research publication about autonomous agent prediction markets, generate specific evaluation criteria tailored to what this publication claims.

PUBLICATION:
Title: ${publication.title}
Abstract: ${publication.abstract}
Focus Area: ${publication.focusArea}
Findings count: ${publication.findings.length}
On-chain references count: ${publication.findings.reduce((s, f) => s + f.onChainRefs.length, 0)}
Observation count: ${publication.dataWindow.observationCount}
Market IDs referenced: ${publication.dataWindow.marketIds.length}

FINDINGS:
${publication.findings.map((f, i) => `${i + 1}. Claim: "${f.claim}" (confidence: ${f.confidence})`).join("\n")}

Generate evaluation criteria for these dimensions:
1. NOVELTY — Is this publication saying something new?
2. COHERENCE — Does the argument flow logically?

For each dimension, create 2-3 specific tests tailored to THIS publication's claims.

Return JSON only:
{
  "novelty": {
    "description": "How novel is this publication",
    "tests": ["specific test 1", "specific test 2"]
  },
  "coherence": {
    "description": "Logical consistency assessment",
    "tests": ["specific test 1", "specific test 2"]
  }
}`;
}
