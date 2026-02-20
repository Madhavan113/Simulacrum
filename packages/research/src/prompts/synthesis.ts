import type { ObservationWindow, ResearchFocusArea } from "@simulacrum/types";
import type { Hypothesis } from "../types.js";
import { FOCUS_AREA_LABELS } from "../types.js";

export function buildSynthesisPrompt(
  hypotheses: Hypothesis[],
  windows: ObservationWindow[],
  focusArea: ResearchFocusArea
): string {
  const totalObs = windows.reduce((sum, w) => sum + w.observations.length, 0);
  const marketIds = [...new Set(windows.flatMap((w) =>
    w.observations.map((o) => o.marketId).filter(Boolean)
  ))];
  const timeRange = windows.length > 0
    ? `${windows[0]!.startTime} to ${windows[windows.length - 1]!.endTime}`
    : "unknown";

  return `You are a research author specializing in ${FOCUS_AREA_LABELS[focusArea]}.

Write a complete research publication about autonomous agent behavior in prediction markets on Hedera (Simulacrum platform).

TOP HYPOTHESIS TO INVESTIGATE:
${JSON.stringify(hypotheses[0], null, 2)}

ALL HYPOTHESES FOR CONTEXT:
${JSON.stringify(hypotheses, null, 2)}

DATA CONTEXT:
- Observation count: ${totalObs}
- Time range: ${timeRange}
- Markets observed: ${marketIds.length}
- Market IDs: ${JSON.stringify(marketIds.slice(0, 20))}

WINDOW SUMMARIES:
${windows.map((w) => JSON.stringify(w.summary)).join("\n")}

WRITING REQUIREMENTS:
1. Title: Specific and descriptive (not generic)
2. Abstract: 2-3 sentence summary of the key finding
3. Methodology: How you analyzed the data, what metrics you used, what the sample size was
4. Findings: 2-4 specific findings, each with a claim, evidence, confidence level, and on-chain references
5. Conclusion: What this means for autonomous agent systems
6. Limitations: Be HONEST about sample size, confounders, and generalizability
7. Future Work: What would strengthen or extend this research

For on-chain references, use this format:
{
  "type": "market",
  "entityId": "the market ID",
  "hashScanUrl": "https://hashscan.io/testnet/topic/<topicId>",
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
