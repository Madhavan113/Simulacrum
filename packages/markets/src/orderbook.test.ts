import { describe, expect, it, vi } from "vitest";

import { cancelOrder, getOrderBook, publishOrder } from "./orderbook.js";
import { createMarketStore } from "./store.js";
import type { Market } from "./types.js";

function buildMarket(): Market {
  return {
    id: "0.0.7100",
    question: "Orderbook test",
    creatorAccountId: "0.0.1001",
    escrowAccountId: "0.0.5000",
    topicId: "0.0.7100",
    topicUrl: "https://hashscan.io/testnet/topic/0.0.7100",
    closeTime: "2026-12-31T00:00:00.000Z",
    createdAt: "2026-02-18T00:00:00.000Z",
    status: "OPEN",
    outcomes: ["YES", "NO"],
    outcomeTokenIds: { YES: "0.0.8101", NO: "0.0.8102" },
    outcomeTokenUrls: {
      YES: "https://hashscan.io/testnet/token/0.0.8101",
      NO: "https://hashscan.io/testnet/token/0.0.8102"
    }
  };
}

describe("orderbook", () => {
  it("publishes, cancels, and returns open book", async () => {
    const store = createMarketStore();
    store.markets.set("0.0.7100", buildMarket());

    const submitMessageMock = vi.fn().mockResolvedValue({
      topicId: "0.0.7100",
      topicUrl: "https://hashscan.io/testnet/topic/0.0.7100",
      transactionId: "0.0.1001@1700000000.000030",
      transactionUrl: "https://hashscan.io/testnet/transaction/tx30",
      sequenceNumber: 1
    });

    const order = await publishOrder(
      {
        marketId: "0.0.7100",
        accountId: "0.0.2001",
        outcome: "YES",
        side: "BID",
        quantity: 5,
        price: 0.62
      },
      {
        store,
        deps: {
          submitMessage: submitMessageMock,
          now: () => new Date("2026-02-18T11:00:00.000Z")
        }
      }
    );

    const cancelled = await cancelOrder("0.0.7100", order.id, "0.0.2001", {
      store,
      deps: {
        submitMessage: submitMessageMock,
        now: () => new Date("2026-02-18T11:01:00.000Z")
      }
    });

    expect(cancelled.status).toBe("CANCELLED");

    const snapshot = await getOrderBook("0.0.7100", {
      store,
      includeMirrorNode: true,
      deps: {
        submitMessage: submitMessageMock,
        getMessages: vi.fn().mockResolvedValue({
          messages: [
            {
              sequenceNumber: 8,
              consensusTimestamp: "1700000000.000000008",
              message: JSON.stringify({
                type: "ORDER_PLACED",
                marketId: "0.0.7100",
                orderId: "mirror-order-1",
                accountId: "0.0.3001",
                outcome: "NO",
                side: "ASK",
                quantity: 3,
                price: 0.66,
                createdAt: "2026-02-18T11:02:00.000Z"
              })
            }
          ],
          nextLink: null
        })
      }
    });

    expect(snapshot.orders).toHaveLength(2);
    expect(snapshot.asks).toHaveLength(1);
    expect(snapshot.bids).toHaveLength(0);
  });
});
