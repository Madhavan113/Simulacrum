import { describe, expect, it } from "vitest";

import { BaseAgent } from "./agent.js";
import { createRandomStrategy } from "./strategies/random.js";
import { runMultiAgentSimulation } from "./simulation.js";

describe("simulation", () => {
  it("runs multi-agent rounds and tracks placements", async () => {
    const agents = [
      new BaseAgent(
        {
          id: "agent-1",
          name: "A1",
          accountId: "0.0.1001",
          bankrollHbar: 100
        },
        createRandomStrategy({ random: () => 0.2 })
      ),
      new BaseAgent(
        {
          id: "agent-2",
          name: "A2",
          accountId: "0.0.1002",
          bankrollHbar: 100
        },
        createRandomStrategy({ random: () => 0.7 })
      )
    ];

    const markets = [
      {
        id: "0.0.7001",
        question: "Q1",
        creatorAccountId: "0.0.5001",
        outcomes: ["YES", "NO"],
        status: "OPEN" as const,
        closeTime: "2026-12-31T00:00:00.000Z"
      }
    ];

    const result = await runMultiAgentSimulation(agents, markets, {
      rounds: 3,
      now: () => new Date("2026-02-18T00:00:00.000Z")
    });

    expect(result.rounds).toBe(3);
    expect(result.betsPlaced).toBe(6);
    expect(result.byAgent["agent-1"]).toBe(3);
    expect(result.byAgent["agent-2"]).toBe(3);
  });
});
