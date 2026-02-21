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
    syntheticOutcomeIds: { YES: "0.0.7001:YES", NO: "0.0.7001:NO" },
    selfAttestation: {
      proposedOutcome: "YES",
      attestedByAccountId: "0.0.1001",
      attestedAt: "2026-02-18T00:05:00.000Z"
    },
    challengeWindowEndsAt: "2026-02-18T00:05:30.000Z",
    challenges: [
      {
        id: "challenge-1",
        marketId: "0.0.7001",
        challengerAccountId: "0.0.9002",
        proposedOutcome: "NO",
        reason: "Challenge for oracle adjudication",
        createdAt: "2026-02-18T00:05:30.000Z"
      }
    ],
    oracleVotes: []
  };
}

describe("submitOracleVote", () => {
  it("rejects creator and challenger accounts from oracle voting", async () => {
    const store = createMarketStore();
    store.markets.set("0.0.7001", seedDisputedMarket());
    const submitMessageMock = vi.fn();

    await expect(
      submitOracleVote(
        {
          marketId: "0.0.7001",
          voterAccountId: "0.0.1001",
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
      )
    ).rejects.toThrow(/ineligible for oracle voting/);

    await expect(
      submitOracleVote(
        {
          marketId: "0.0.7001",
          voterAccountId: "0.0.9002",
          outcome: "NO",
          confidence: 0.9,
          reputationScore: 12
        },
        {
          store,
          oracleMinVotes: 3,
          deps: {
            submitMessage: submitMessageMock,
            now: () => new Date("2026-02-18T00:06:30.000Z")
          }
        }
      )
    ).rejects.toThrow(/ineligible for oracle voting/);

    expect(submitMessageMock).not.toHaveBeenCalled();
  });

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
