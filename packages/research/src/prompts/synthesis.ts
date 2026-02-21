import type { ObservationWindow, ResearchFocusArea } from "@simulacrum/types";
import type { Hypothesis } from "../types.js";
import { FOCUS_AREA_LABELS } from "../types.js";

function rankHypotheses(hypotheses: Hypothesis[]): Hypothesis[] {
  return [...hypotheses].sort((a, b) => {
    const scoreA = (a.testability ?? 0) * 0.6 + (a.novelty ?? 0) * 0.4;
    const scoreB = (b.testability ?? 0) * 0.6 + (b.novelty ?? 0) * 0.4;
    return scoreB - scoreA;
  });
}

export function buildSynthesisPrompt(
  hypotheses: Hypothesis[],
  windows: ObservationWindow[],
  focusArea: ResearchFocusArea
): string {
  const ranked = rankHypotheses(hypotheses);
  const totalObs = windows.reduce((sum, w) => sum + w.observations.length, 0);
  const marketIds = [...new Set(windows.flatMap((w) =>
    w.observations.map((o) => o.marketId).filter(Boolean)
  ))];
  const timeRange = windows.length > 0
    ? `${windows[0]!.startTime} to ${windows[windows.length - 1]!.endTime}`
    : "unknown";

  return `You are a research author specializing in ${FOCUS_AREA_LABELS[focusArea]}.

Write a complete research publication about autonomous agent behavior in prediction markets on Hedera (Simulacrum platform).

BEST HYPOTHESIS (ranked by testability + novelty):
${JSON.stringify(ranked[0], null, 2)}

ALL HYPOTHESES (ranked):
${JSON.stringify(ranked, null, 2)}

DATA CONTEXT:
- Observation count: ${totalObs}
- Time range: ${timeRange}
- Markets observed: ${marketIds.length}
- Market IDs: ${JSON.stringify(marketIds.slice(0, 20))}

WINDOW SUMMARIES:
${windows.map((w) => JSON.stringify(w.summary)).join("\n")}

CRITICAL RULES — HALLUCINATION PREVENTION:
- You may ONLY use market IDs from the "Market IDs" list above. Do NOT invent market IDs.
- You may ONLY reference observations and data points present in the window summaries and data context above.
- hashScanUrl MUST use an entityId from the Market IDs list: "https://hashscan.io/testnet/topic/<entityId>"
- If you cannot find a real reference for a claim, either lower the confidence to below 0.3 or omit the claim entirely.
- Do NOT fabricate transaction hashes, topic IDs, or agent IDs that are not in the provided data.

WRITING REQUIREMENTS:
1. Title: Specific and descriptive (not generic)
2. Abstract: 2-3 sentence summary of the key finding
3. Methodology: How you analyzed the data, what metrics you used, what the sample size was
4. Findings: 2-4 specific findings, each with a claim, evidence, confidence level, and on-chain references
5. Conclusion: What this means for autonomous agent systems
6. Limitations: Be HONEST about sample size, confounders, and generalizability
7. Future Work: What would strengthen or extend this research

CONFIDENCE CALIBRATION:
- 0.0-0.3: Speculative — pattern observed but insufficient evidence
- 0.3-0.5: Preliminary — some supporting data but not conclusive
- 0.5-0.7: Moderate — multiple data points support the claim
- 0.7-0.9: Strong — clear pattern with substantial evidence
- 0.9-1.0: Very strong — overwhelming evidence, multiple independent confirmations

For on-chain references, use this format:
{
  "type": "market",
  "entityId": "<must be from Market IDs list above>",
  "hashScanUrl": "https://hashscan.io/testnet/topic/<entityId>",
  "description": "what this reference demonstrates"
}

Return JSON only with this schema:
{
  "title": "string",
  "abstract": "string",
  "methodology": "string",
  "findings": [
    {
      "claim": "string",
      "evidence": "string",
      "supportingData": {},
      "onChainRefs": [{"type": "market", "entityId": "...", "hashScanUrl": "...", "description": "..."}],
      "confidence": 0.0-1.0
    }
  ],
  "conclusion": "string",
  "limitations": "string",
  "futureWork": "string"
}`;
}
