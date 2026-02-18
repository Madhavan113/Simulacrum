import { describe, expect, it } from "vitest";

import { BaseAgent } from "./agent.js";
import { createContrarianStrategy } from "./strategies/contrarian.js";
import { createRandomStrategy } from "./strategies/random.js";
import { createReputationBasedStrategy } from "./strategies/reputation-based.js";

describe("BaseAgent and strategies", () => {
  const market = {
    id: "0.0.7001",
    question: "Will outcome be YES?",
    creatorAccountId: "0.0.5001",
    outcomes: ["YES", "NO"],
    status: "OPEN" as const,
    closeTime: "2026-12-31T00:00:00.000Z"
  };

  it("uses random strategy deterministically with injected random", async () => {
    const agent = new BaseAgent(
      {
        name: "RandomAgent",
        accountId: "0.0.1001",
        bankrollHbar: 100
      },
      createRandomStrategy({ random: () => 0.1 })
    );

    const decision = await agent.decideBet(market, {
      now: new Date("2026-02-18T00:00:00.000Z"),
      reputationByAccount: {},
      marketSentiment: {}
    });

    expect(decision?.outcome).toBe("YES");
    expect(decision?.amountHbar).toBeGreaterThan(0);
  });

  it("uses reputation-based strategy", async () => {
    const agent = new BaseAgent(
      {
        name: "RepAgent",
        accountId: "0.0.1002",
        bankrollHbar: 80
      },
      createReputationBasedStrategy({ highReputationThreshold: 60 })
    );

    const decision = await agent.decideBet(market, {
      now: new Date("2026-02-18T00:00:00.000Z"),
      reputationByAccount: {
        "0.0.5001": 90
      },
      marketSentiment: {}
    });

    expect(decision?.outcome).toBe("YES");
  });

  it("uses contrarian strategy", async () => {
    const agent = new BaseAgent(
      {
        name: "ContraAgent",
        accountId: "0.0.1003",
        bankrollHbar: 80
      },
      createContrarianStrategy()
    );

    const decision = await agent.decideBet(market, {
      now: new Date("2026-02-18T00:00:00.000Z"),
      reputationByAccount: {},
      marketSentiment: {
        "0.0.7001": {
          YES: 0.8,
          NO: 0.2
        }
      }
    });

    expect(decision?.outcome).toBe("NO");
  });
});
