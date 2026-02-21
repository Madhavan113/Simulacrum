import { describe, expect, it, vi } from "vitest";

import { createMarket } from "./create.js";
import { createMarketStore } from "./store.js";

const submitMessageMock = vi.fn().mockResolvedValue({
  topicId: "0.0.7001",
  topicUrl: "https://hashscan.io/testnet/topic/0.0.7001",
  transactionId: "0.0.1001@1700000000.000004",
  transactionUrl: "https://hashscan.io/testnet/transaction/tx4",
  sequenceNumber: 1
});

const createTopicMock = vi.fn().mockResolvedValue({
  topicId: "0.0.7001",
  topicUrl: "https://hashscan.io/testnet/topic/0.0.7001",
  transactionId: "0.0.1001@1700000000.000001",
  transactionUrl: "https://hashscan.io/testnet/transaction/tx1"
});

const transferHbarMock = vi.fn().mockResolvedValue({
  transactionId: "0.0.1001@1700000000.000002",
  transactionUrl: "https://hashscan.io/testnet/transaction/tx2"
});

const baseDeps = {
  createTopic: createTopicMock,
  submitMessage: submitMessageMock,
  transferHbar: transferHbarMock,
  now: () => new Date("2026-02-18T00:00:00.000Z")
};

describe("createMarket", () => {
  it("creates a CLOB market with funding and seed orders", async () => {
    const store = createMarketStore();

    const marketResult = await createMarket(
      {
        question: "Will BTC hit 100k by March?",
        creatorAccountId: "0.0.1001",
        escrowAccountId: "0.0.5000",
        closeTime: "2026-03-01T00:00:00.000Z",
        initialFundingHbar: 100,
        seedOrders: [
          { outcome: "YES", side: "BID", quantity: 10, price: 0.5 },
          { outcome: "YES", side: "ASK", quantity: 10, price: 0.6 }
        ]
      },
      { store, deps: baseDeps }
    );

    expect(createTopicMock).toHaveBeenCalledOnce();
    expect(transferHbarMock).toHaveBeenCalledWith("0.0.1001", "0.0.5000", 100, expect.anything());
    expect(marketResult.market.id).toBe("0.0.7001");
    expect(marketResult.market.initialFundingHbar).toBe(100);
    expect(marketResult.market.fundingTransactionId).toBe("0.0.1001@1700000000.000002");
    expect(marketResult.market.syntheticOutcomeIds).toEqual({
      YES: "0.0.7001:YES",
      NO: "0.0.7001:NO"
    });
    expect(store.markets.get("0.0.7001")).toBeDefined();
    expect(store.orders.get("0.0.7001")).toHaveLength(2);
  });

  it("creates an LMSR market with funding backing the liquidity parameter", async () => {
    const store = createMarketStore();

    const marketResult = await createMarket(
      {
        question: "Will ETH flip BTC?",
        creatorAccountId: "0.0.1001",
        escrowAccountId: "0.0.5000",
        closeTime: "2026-03-01T00:00:00.000Z",
        liquidityModel: "LOW_LIQUIDITY",
        curveLiquidityHbar: 50,
        initialFundingHbar: 50
      },
      { store, deps: baseDeps }
    );

    expect(marketResult.market.liquidityModel).toBe("LOW_LIQUIDITY");
    expect(marketResult.market.initialFundingHbar).toBe(50);
    expect(marketResult.market.curveState?.liquidityParameterHbar).toBe(50);
    expect(marketResult.market.markPriceSource).toBe("INITIAL");
  });

  it("rejects market creation without funding", async () => {
    const store = createMarketStore();

    await expect(
      createMarket(
        {
          question: "Unfunded market",
          creatorAccountId: "0.0.1001",
          closeTime: "2026-03-01T00:00:00.000Z",
          initialFundingHbar: 0,
          seedOrders: [
            { outcome: "YES", side: "BID", quantity: 1, price: 0.5 },
            { outcome: "YES", side: "ASK", quantity: 1, price: 0.6 }
          ]
        },
        { store, deps: baseDeps }
      )
    ).rejects.toThrow("initialFundingHbar is required");
  });

  it("rejects LMSR market when funding is below liquidity parameter", async () => {
    const store = createMarketStore();

    await expect(
      createMarket(
        {
          question: "Underfunded LMSR",
          creatorAccountId: "0.0.1001",
          closeTime: "2026-03-01T00:00:00.000Z",
          liquidityModel: "LOW_LIQUIDITY",
          curveLiquidityHbar: 50,
          initialFundingHbar: 10
        },
        { store, deps: baseDeps }
      )
    ).rejects.toThrow("liquidity parameter");
  });

  it("rejects CLOB market without seed orders", async () => {
    const store = createMarketStore();

    await expect(
      createMarket(
        {
          question: "No seeds",
          creatorAccountId: "0.0.1001",
          closeTime: "2026-03-01T00:00:00.000Z",
          initialFundingHbar: 100
        },
        { store, deps: baseDeps }
      )
    ).rejects.toThrow("seedOrders");
  });

  it("rejects CLOB seed orders missing a BID or ASK side", async () => {
    const store = createMarketStore();

    await expect(
      createMarket(
        {
          question: "One-sided seeds",
          creatorAccountId: "0.0.1001",
          closeTime: "2026-03-01T00:00:00.000Z",
          initialFundingHbar: 100,
          seedOrders: [
            { outcome: "YES", side: "BID", quantity: 10, price: 0.5 }
          ]
        },
        { store, deps: baseDeps }
      )
    ).rejects.toThrow("at least one BID and one ASK");
  });
});
