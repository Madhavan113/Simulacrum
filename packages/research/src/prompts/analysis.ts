import type { ObservationWindow, ResearchFocusArea } from "@simulacrum/types";
import { FOCUS_AREA_LABELS } from "../types.js";

export function buildAnalysisPrompt(
  windows: ObservationWindow[],
  focusArea: ResearchFocusArea,
  previousFindings?: string[]
): string {
  const totalObs = windows.reduce((sum, w) => sum + w.observations.length, 0);
  const summaries = windows.map((w) => JSON.stringify(w.summary)).join("\n");

  const sampleObs = windows
    .flatMap((w) => w.observations)
    .slice(0, 200)
    .map((o) => ({
      id: o.id,
      category: o.category,
      sourceEvent: o.sourceEvent,
      marketId: o.marketId,
      agentIds: o.agentIds,
      metrics: o.metrics,
      timestamp: o.timestamp,
    }));

  const previousContext = previousFindings?.length
    ? `\nPrevious findings from this research area (do NOT repeat these — find something NEW):\n${previousFindings.map((f) => `- ${f}`).join("\n")}`
    : "";

  return `You are a research analyst specializing in ${FOCUS_AREA_LABELS[focusArea]}.

You are analyzing data from the Simulacrum autonomous prediction market platform on Hedera. Autonomous agents create markets, place bets, resolve outcomes, build reputation, and coordinate through economic incentives. Your job is to identify meaningful behavioral patterns in this data.

ANALYSIS INSTRUCTIONS:
1. Find what's SURPRISING, not what's obvious
2. Every pattern MUST cite at least 2 specific data points from the observations
3. Look for temporal correlations, behavioral clusters, and emergent dynamics
4. Distinguish signal from noise — small sample sizes should reduce confidence
5. Identify anomalies that don't fit expected patterns

DATA SUMMARY:
Total observations: ${totalObs}
Window summaries:
${summaries}

SAMPLE OBSERVATIONS (up to 200):
${JSON.stringify(sampleObs, null, 2)}
${previousContext}

Return JSON only with this schema:
{
  "patterns": [
    {
      "description": "Clear description of the pattern",
      "category": "observation category this relates to",
      "supportingObservationIds": ["ids from the data"],
      "metrics": {"key": "quantitative measure"},
      "significance": 0.0-1.0
    }
  ],
  "anomalies": [
    {
      "description": "What's unusual",
      "observationId": "id",
      "severity": "LOW|MEDIUM|HIGH",
      "details": "Why this is anomalous"
    }
  ],
  "summary": "Brief overall assessment of the data"
}`;
}
