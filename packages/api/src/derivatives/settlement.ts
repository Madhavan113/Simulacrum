import { getDerivativesStore, settleFunding } from "@simulacrum/derivatives";
import { getMarketStore, type Market } from "@simulacrum/markets";

import type { ApiEventBus } from "../events.js";

export interface FundingSettlementSweepOptions {
  eventBus: ApiEventBus;
  now?: Date;
}

/**
 * Settle funding for every open-position market+outcome pair.
 *
 * Mirrors the pattern in markets/lifecycle.ts — designed to be called on a
 * recurring interval (default: 1 hour).
 */
export function runFundingSettlementSweep(options: FundingSettlementSweepOptions): void {
  const derivStore = getDerivativesStore();
  const marketStore = getMarketStore();
  const now = options.now ?? new Date();

  const openPairs = new Set<string>();
  for (const p of derivStore.positions.values()) {
    if (p.status === "OPEN") {
      openPairs.add(`${p.marketId}::${p.outcome}`);
    }
  }

  if (openPairs.size === 0) return;

  let totalPayments = 0;
  let totalAmountHbar = 0;

  for (const key of openPairs) {
    const [marketId, outcome] = key.split("::");
    const market: Market | undefined = marketStore.markets.get(marketId);

    if (!market || market.status === "RESOLVED") continue;

    try {
      const payments = settleFunding(market, outcome, { now: () => now });

      totalPayments += payments.length;
      for (const p of payments) {
        totalAmountHbar += Math.abs(p.amountHbar);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[funding-settlement] Failed for ${marketId}/${outcome}: ${message}`);

      options.eventBus.publish("derivatives.funding_error", {
        marketId,
        outcome,
        error: message,
        timestamp: now.toISOString(),
      });
    }
  }

  if (totalPayments > 0) {
    options.eventBus.publish("derivatives.funding_settled", {
      marketsSettled: openPairs.size,
      totalPayments,
      totalAmountHbar: Number(totalAmountHbar.toFixed(8)),
      timestamp: now.toISOString(),
    });
  }
}
