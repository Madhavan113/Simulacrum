import { describe, expect, it, vi } from "vitest";

import { placeBet } from "./bet.js";
import { createMarket } from "./create.js";
import { createMarketStore } from "./store.js";

describe("weighted curve markets", () => {
  it("updates implied odds and share state when low-liquidity bets are placed", async () => {
    const store = createMarketStore();
    const createTopicMock = vi.fn().mockResolvedValue({
      topicId: "0.0.7001",
      topicUrl: "https://hashscan.io/testnet/topic/0.0.7001",
      transactionId: "0.0.1001@1700000000.000001",
      transactionUrl: "https://hashscan.io/testnet/transaction/tx1"
    });
    const created = await createMarket(
      {
        question: "Will low-liquidity curve update?",
        creatorAccountId: "0.0.1001",
        escrowAccountId: "0.0.5000",
        closeTime: "2026-03-01T00:00:00.000Z",
        lowLiquidity: true,
        initialOddsByOutcome: { YES: 70, NO: 30 }
      },
      {
        store,
        deps: {
          createTopic: createTopicMock,
          submitMessage: vi.fn().mockResolvedValue({
            topicId: "0.0.7001",
            topicUrl: "https://hashscan.io/testnet/topic/0.0.7001",
            transactionId: "0.0.1001@1700000000.000004",
            transactionUrl: "https://hashscan.io/testnet/transaction/tx4",
            sequenceNumber: 1
          }),
          now: () => new Date("2026-02-18T00:00:00.000Z")
        }
      }
    );

    expect(created.market.liquidityModel).toBe("WEIGHTED_CURVE");
    expect(created.market.curveState).toBeDefined();
    const beforeOdds = created.market.currentOddsByOutcome?.YES ?? 0;

    const bet = await placeBet(
      {
        marketId: created.market.id,
        bettorAccountId: "0.0.2001",
        outcome: "YES",
        amountHbar: 5
      },
      {
        store,
        deps: {
          transferHbar: vi.fn().mockResolvedValue({
            transactionId: "0.0.2001@1700000000.000010",
            transactionUrl: "https://hashscan.io/testnet/transaction/tx10"
          }),
          submitMessage: vi.fn().mockResolvedValue({
            topicId: "0.0.7001",
            topicUrl: "https://hashscan.io/testnet/topic/0.0.7001",
            transactionId: "0.0.2001@1700000000.000011",
            transactionUrl: "https://hashscan.io/testnet/transaction/tx11",
            sequenceNumber: 2
          }),
          now: () => new Date("2026-02-18T00:01:00.000Z")
        }
      }
    );

    const updated = store.markets.get(created.market.id);
    expect(bet.curveSharesPurchased).toBeDefined();
    expect((bet.curveSharesPurchased ?? 0) > 0).toBe(true);
    expect(updated?.currentOddsByOutcome?.YES ?? 0).toBeGreaterThan(beforeOdds);
  });
});
