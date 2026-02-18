import { describe, expect, it, vi } from "vitest";

import { createMarket } from "./create.js";
import { createMarketStore } from "./store.js";

describe("createMarket", () => {
  it("creates a market with outcome tokens and topic", async () => {
    const store = createMarketStore();
    const createTopicMock = vi.fn().mockResolvedValue({
      topicId: "0.0.7001",
      topicUrl: "https://hashscan.io/testnet/topic/0.0.7001",
      transactionId: "0.0.1001@1700000000.000001",
      transactionUrl: "https://hashscan.io/testnet/transaction/tx1"
    });
    const createTokenMock = vi
      .fn()
      .mockResolvedValueOnce({
        tokenId: "0.0.8001",
        tokenUrl: "https://hashscan.io/testnet/token/0.0.8001",
        transactionId: "0.0.1001@1700000000.000002",
        transactionUrl: "https://hashscan.io/testnet/transaction/tx2"
      })
      .mockResolvedValueOnce({
        tokenId: "0.0.8002",
        tokenUrl: "https://hashscan.io/testnet/token/0.0.8002",
        transactionId: "0.0.1001@1700000000.000003",
        transactionUrl: "https://hashscan.io/testnet/transaction/tx3"
      });

    const marketResult = await createMarket(
      {
        question: "Will BTC hit 100k by March?",
        creatorAccountId: "0.0.1001",
        closeTime: "2026-03-01T00:00:00.000Z"
      },
      {
        store,
        deps: {
          createTopic: createTopicMock,
          createFungibleToken: createTokenMock,
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

    expect(createTopicMock).toHaveBeenCalledOnce();
    expect(createTokenMock).toHaveBeenCalledTimes(2);
    expect(marketResult.market.id).toBe("0.0.7001");
    expect(marketResult.market.outcomeTokenIds.YES).toBe("0.0.8001");
    expect(marketResult.market.outcomeTokenIds.NO).toBe("0.0.8002");
    expect(store.markets.get("0.0.7001")).toBeDefined();
  });
});
