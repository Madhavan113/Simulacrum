import {
  getMarketStore,
  persistMarketStore,
  resolveMarket,
  type Market,
  type MarketBet
} from "@simulacrum/markets";

import type { ApiEventBus } from "../events.js";

export interface MarketLifecycleSweepOptions {
  eventBus: ApiEventBus;
  now?: Date;
  autoResolveAfterMs?: number;
  resolvedByAccountId?: string;
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function pickResolvedOutcome(market: Market, bets: readonly MarketBet[]): string {
  const totals = Object.fromEntries(market.outcomes.map((outcome) => [outcome, 0]));

  for (const bet of bets) {
    if (!(bet.outcome in totals)) {
      continue;
    }

    totals[bet.outcome] = (totals[bet.outcome] ?? 0) + bet.amountHbar;
  }

  const byBets = Object.entries(totals).sort((left, right) => right[1] - left[1]);

  if ((byBets[0]?.[1] ?? 0) > 0) {
    return byBets[0]?.[0] ?? market.outcomes[0] ?? "YES";
  }

  const byInitialOdds = Object.entries(market.initialOddsByOutcome ?? {})
    .map(([outcome, weight]) => [outcome.trim().toUpperCase(), Number.isFinite(weight) ? weight : 0] as const)
    .filter(([outcome]) => market.outcomes.includes(outcome))
    .sort((left, right) => right[1] - left[1]);

  return byInitialOdds[0]?.[0] ?? market.outcomes[0] ?? "YES";
}

export async function runMarketLifecycleSweep(options: MarketLifecycleSweepOptions): Promise<void> {
  const store = getMarketStore();
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const autoResolveAfterMs = Math.max(0, Math.round(options.autoResolveAfterMs ?? 0));
  const resolvedByAccountId =
    options.resolvedByAccountId?.trim() ||
    process.env.MARKET_AUTO_RESOLVE_ACCOUNT_ID ||
    process.env.HEDERA_ACCOUNT_ID ||
    "SYSTEM_TIMER";

  const closedMarketIds: string[] = [];

  for (const market of store.markets.values()) {
    if (market.status !== "OPEN") {
      continue;
    }

    if (parseTimestamp(market.closeTime) > nowMs) {
      continue;
    }

    market.status = "CLOSED";
    closedMarketIds.push(market.id);
  }

  if (closedMarketIds.length > 0) {
    persistMarketStore(store);

    for (const marketId of closedMarketIds) {
      options.eventBus.publish("market.closed", {
        marketId,
        closedAt: nowIso
      });
    }
  }

  const resolvable = Array.from(store.markets.values()).filter((market) => {
    if (market.status !== "CLOSED") {
      return false;
    }

    const closeTimeMs = parseTimestamp(market.closeTime);
    return closeTimeMs + autoResolveAfterMs <= nowMs;
  });

  for (const market of resolvable) {
    const bets = store.bets.get(market.id) ?? [];
    const resolvedOutcome = pickResolvedOutcome(market, bets);

    try {
      const resolution = await resolveMarket({
        marketId: market.id,
        resolvedOutcome,
        resolvedByAccountId,
        reason: "Timer-based market lifecycle resolution"
      });
      options.eventBus.publish("market.resolved", resolution);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (/already resolved/i.test(message)) {
        continue;
      }

      options.eventBus.publish("market.resolve_error", {
        marketId: market.id,
        error: message,
        source: "lifecycle-sweeper"
      });
    }
  }
}
