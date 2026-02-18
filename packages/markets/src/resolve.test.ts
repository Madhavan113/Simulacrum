import { describe, expect, it, vi } from "vitest";

import { submitOracleVote } from "./resolve.js";
import { createMarketStore } from "./store.js";
import type { Market } from "./types.js";

function seedDisputedMarket(): Market {
  return {
    id: "0.0.7001",
    question: "Will task complete?",
    creatorAccountId: "0.0.1001",
    escrowAccountId: "0.0.5000",
    topicId: "0.0.7001",
    topicUrl: "https://hashscan.io/testnet/topic/0.0.7001",
    closeTime: "2026-12-31T00:00:00.000Z",
    createdAt: "2026-02-18T00:00:00.000Z",
    status: "DISPUTED",
    outcomes: ["YES", "NO"],
    outcomeTokenIds: { YES: "0.0.8001", NO: "0.0.8002" },
    outcomeTokenUrls: {
      YES: "https://hashscan.io/testnet/token/0.0.8001",
      NO: "https://hashscan.io/testnet/token/0.0.8002"
    },
    selfAttestation: {
      proposedOutcome: "YES",
      attestedByAccountId: "0.0.1001",
      attestedAt: "2026-02-18T00:05:00.000Z"
    },
    challengeWindowEndsAt: "2099-01-01T00:00:00.000Z",
    challenges: [],
    oracleVotes: []
  };
}

describe("submitOracleVote", () => {
  it("rejects duplicate votes from the same account", async () => {
    const store = createMarketStore();
    store.markets.set("0.0.7001", seedDisputedMarket());

    const submitMessageMock = vi.fn().mockResolvedValue({
      topicId: "0.0.7001",
      topicUrl: "https://hashscan.io/testnet/topic/0.0.7001",
      transactionId: "0.0.9001@1700000000.000001",
      transactionUrl: "https://hashscan.io/testnet/transaction/tx1",
      sequenceNumber: 1
    });

    await submitOracleVote(
      {
        marketId: "0.0.7001",
        voterAccountId: "0.0.9001",
        outcome: "YES",
        confidence: 0.9,
        reputationScore: 12
      },
      {
        store,
        oracleMinVotes: 3,
        deps: {
          submitMessage: submitMessageMock,
          now: () => new Date("2026-02-18T00:06:00.000Z")
        }
      }
    );

    await expect(
      submitOracleVote(
        {
          marketId: "0.0.7001",
          voterAccountId: "0.0.9001",
          outcome: "NO",
          confidence: 0.8,
          reputationScore: 20
        },
        {
          store,
          oracleMinVotes: 3,
          deps: {
            submitMessage: submitMessageMock,
            now: () => new Date("2026-02-18T00:07:00.000Z")
          }
        }
      )
    ).rejects.toThrow(/already submitted an oracle vote/);

    const market = store.markets.get("0.0.7001");
    expect(market?.oracleVotes).toHaveLength(1);
    expect(market?.oracleVotes?.[0]?.outcome).toBe("YES");
    expect(submitMessageMock).toHaveBeenCalledTimes(1);
  });
});
