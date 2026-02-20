import { randomUUID } from "node:crypto";
import type { ObservationWindow, ResearchObservation, WindowSummary } from "@simulacrum/types";

export function createEmptySummary(): WindowSummary {
  return {
    observationCount: 0,
    marketCount: 0,
    betCount: 0,
    totalVolumeHbar: 0,
    activeAgentCount: 0,
    disputeCount: 0,
    avgOddsShift: 0,
    priceEfficiency: 0,
    uniqueStrategiesObserved: 0,
  };
}

export function computeSummary(observations: ResearchObservation[]): WindowSummary {
  const marketIds = new Set<string>();
  const agentIds = new Set<string>();
  let betCount = 0;
  let totalVolume = 0;
  let oddsShiftSum = 0;
  let oddsShiftCount = 0;
  let disputeCount = 0;
  const strategies = new Set<string>();

  for (const obs of observations) {
    if (obs.marketId) marketIds.add(obs.marketId);
    for (const id of obs.agentIds) agentIds.add(id);

    if (obs.category === "price_movement") {
      betCount += 1;
      totalVolume += obs.metrics.amountHbar ?? 0;
      if (obs.metrics.oddsShift !== undefined) {
        oddsShiftSum += Math.abs(obs.metrics.oddsShift);
        oddsShiftCount += 1;
      }
    }

    if (obs.category === "dispute_resolution") {
      disputeCount += 1;
    }

    if (obs.category === "agent_strategy") {
      const strategy = obs.context.strategy as string | undefined;
      if (strategy) strategies.add(strategy);
    }

    if (obs.category === "liquidity_event") {
      totalVolume += obs.metrics.amountHbar ?? obs.metrics.quantity ?? 0;
    }
  }

  return {
    observationCount: observations.length,
    marketCount: marketIds.size,
    betCount,
    totalVolumeHbar: totalVolume,
    activeAgentCount: agentIds.size,
    disputeCount,
    avgOddsShift: oddsShiftCount > 0 ? oddsShiftSum / oddsShiftCount : 0,
    priceEfficiency: 0,
    uniqueStrategiesObserved: strategies.size,
  };
}

export function createWindow(observations: ResearchObservation[]): ObservationWindow {
  const now = new Date().toISOString();
  const startTime = observations.length > 0
    ? observations[0]!.timestamp
    : now;
  const endTime = observations.length > 0
    ? observations[observations.length - 1]!.timestamp
    : now;

  return {
    id: randomUUID(),
    startTime,
    endTime,
    observations,
    summary: computeSummary(observations),
  };
}
