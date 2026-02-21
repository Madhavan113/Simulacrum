import {
  expireOptions,
  getDerivativesStore,
  refreshAllOptions,
} from "@simulacrum/derivatives";
import { getMarketStore, type Market } from "@simulacrum/markets";

import type { ApiEventBus } from "../events.js";

export interface OptionsSweepOptions {
  eventBus: ApiEventBus;
  now?: Date;
}

/**
 * Mark-to-market all active options and expire any past their expiry date.
 *
 * Designed to run on a recurring interval (e.g. every 15–30 seconds) so that
 * option premiums reflect current underlying probability and time decay.
 */
export function runOptionsSweep(options: OptionsSweepOptions): void {
  const derivStore = getDerivativesStore();
  const marketStore = getMarketStore();
  const now = options.now ?? new Date();
  const nowFn = () => now;

  const expired = expireOptions({ now: nowFn });
  if (expired.length > 0) {
    options.eventBus.publish("derivatives.options_expired", {
      count: expired.length,
      optionIds: expired.map((o) => o.id),
      timestamp: now.toISOString(),
    });
  }

  const activeMarketIds = new Set<string>();
  for (const opt of derivStore.options.values()) {
    if (opt.status === "ACTIVE") {
      activeMarketIds.add(opt.marketId);
    }
  }

  if (activeMarketIds.size === 0) return;

  let totalRefreshed = 0;

  for (const marketId of activeMarketIds) {
    const market: Market | undefined = marketStore.markets.get(marketId);
    if (!market || market.status === "RESOLVED") continue;

    try {
      const refreshed = refreshAllOptions(market, { now: nowFn });
      totalRefreshed += refreshed.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[options-sweep] Failed mark-to-market for market ${marketId}: ${message}`);

      options.eventBus.publish("derivatives.options_mtm_error", {
        marketId,
        error: message,
        timestamp: now.toISOString(),
      });
    }
  }

  if (totalRefreshed > 0) {
    options.eventBus.publish("derivatives.options_refreshed", {
      marketsProcessed: activeMarketIds.size,
      optionsRefreshed: totalRefreshed,
      timestamp: now.toISOString(),
    });
  }
}
