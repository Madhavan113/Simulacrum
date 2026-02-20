import { describe, expect, it, vi } from "vitest";

import { placeBet } from "./bet.js";
import { claimWinnings } from "./claim.js";
import { resolveMarket } from "./resolve.js";
import { createMarketStore } from "./store.js";
import type { Market } from "./types.js";

function seedMarket(): Market {
  return {
    id: "0.0.7001",
    question: "Will task complete?",
    creatorAccountId: "0.0.1001",
    escrowAccountId: "0.0.5000",
    topicId: "0.0.7001",
    topicUrl: "https://hashscan.io/testnet/topic/0.0.7001",
    closeTime: "2026-12-31T00:00:00.000Z",
    createdAt: "2026-02-18T00:00:00.000Z",
    status: "OPEN",
    outcomes: ["YES", "NO"],
    syntheticOutcomeIds: { YES: "0.0.7001:YES", NO: "0.0.7001:NO" }
  };
}

describe("bet, resolve, and claim", () => {
  it("handles a full market lifecycle", async () => {
    const store = createMarketStore();
    store.markets.set("0.0.7001", seedMarket());

    const transferHbarMock = vi
      .fn()
      .mockResolvedValueOnce({
        transactionId: "0.0.2001@1700000000.000010",
        transactionUrl: "https://hashscan.io/testnet/transaction/tx10"
      })
      .mockResolvedValueOnce({
        transactionId: "0.0.2001@1700000000.000011",
        transactionUrl: "https://hashscan.io/testnet/transaction/tx11"
      })
      .mockResolvedValueOnce({
        transactionId: "0.0.2001@1700000000.000012",
        transactionUrl: "https://hashscan.io/testnet/transaction/tx12"
      });

    await placeBet(
      {
        marketId: "0.0.7001",
        bettorAccountId: "0.0.2001",
        outcome: "YES",
        amountHbar: 20
      },
      {
        store,
        deps: {
          transferHbar: transferHbarMock,
          submitMessage: vi.fn().mockResolvedValue({
            topicId: "0.0.7001",
            topicUrl: "https://hashscan.io/testnet/topic/0.0.7001",
            transactionId: "0.0.2001@1700000000.000020",
            transactionUrl: "https://hashscan.io/testnet/transaction/tx20",
            sequenceNumber: 1
          }),
          now: () => new Date("2026-02-18T10:00:00.000Z")
        }
      }
    );

    await placeBet(
      {
        marketId: "0.0.7001",
        bettorAccountId: "0.0.2002",
        outcome: "NO",
        amountHbar: 10
      },
      {
        store,
        deps: {
          transferHbar: transferHbarMock,
          submitMessage: vi.fn().mockResolvedValue({
            topicId: "0.0.7001",
            topicUrl: "https://hashscan.io/testnet/topic/0.0.7001",
            transactionId: "0.0.2002@1700000000.000021",
            transactionUrl: "https://hashscan.io/testnet/transaction/tx21",
            sequenceNumber: 2
          }),
          now: () => new Date("2026-02-18T10:01:00.000Z")
        }
      }
    );

    const resolution = await resolveMarket(
      {
        marketId: "0.0.7001",
        resolvedOutcome: "YES",
        resolvedByAccountId: "0.0.1001"
      },
      {
        store,
        deps: {
          submitMessage: vi.fn().mockResolvedValue({
            topicId: "0.0.7001",
            topicUrl: "https://hashscan.io/testnet/topic/0.0.7001",
            transactionId: "0.0.9999@1700000000.000022",
            transactionUrl: "https://hashscan.io/testnet/transaction/tx22",
            sequenceNumber: 3
          }),
          now: () => new Date("2026-02-18T10:02:00.000Z")
        }
      }
    );

    const claim = await claimWinnings(
      {
        marketId: "0.0.7001",
        accountId: "0.0.2001"
      },
      {
        store,
        deps: {
          transferHbar: transferHbarMock,
          now: () => new Date("2026-02-18T10:03:00.000Z")
        }
      }
    );

    expect(resolution.resolvedOutcome).toBe("YES");
    expect(claim.payoutHbar).toBe(30);
    await expect(
      claimWinnings(
        {
          marketId: "0.0.7001",
          accountId: "0.0.2001"
        },
        {
          store,
          deps: {
            transferHbar: transferHbarMock,
            now: () => new Date("2026-02-18T10:04:00.000Z")
          }
        }
      )
    ).rejects.toThrow(/already claimed/);
  });
});
