import { describe, expect, it, vi } from "vitest";

import { BaseAgent } from "./agent.js";
import { createOpenClawAdapter, OpenClawIntegrationError } from "./openclaw.js";
import { createRandomStrategy } from "./strategies/random.js";

describe("openclaw adapter", () => {
  it("dispatches supported tools", async () => {
    const agent = new BaseAgent(
      {
        name: "OC",
        accountId: "0.0.1001",
        bankrollHbar: 50
      },
      createRandomStrategy({ random: () => 0.5 })
    );

    const createMarketMock = vi.fn().mockResolvedValue({ marketId: "0.0.7001" });
    const placeBetMock = vi.fn().mockResolvedValue({ ok: true });

    const adapter = createOpenClawAdapter(agent, {
      createMarket: createMarketMock,
      placeBet: placeBetMock
    });

    const created = await adapter.handleToolCall({
      name: "create_market",
      args: { question: "Will this ship?" }
    });

    expect(created).toEqual({ marketId: "0.0.7001" });
    expect(createMarketMock).toHaveBeenCalledOnce();

    await adapter.handleToolCall({
      name: "place_bet",
      args: { marketId: "0.0.7001", outcome: "YES", amountHbar: 5 }
    });

    expect(placeBetMock).toHaveBeenCalledOnce();
  });

  it("throws for unknown tools", async () => {
    const agent = new BaseAgent(
      {
        name: "OC2",
        accountId: "0.0.1002",
        bankrollHbar: 50
      },
      createRandomStrategy({ random: () => 0.5 })
    );

    const adapter = createOpenClawAdapter(agent, {});

    await expect(
      adapter.handleToolCall({ name: "unknown_tool", args: {} })
    ).rejects.toThrow(OpenClawIntegrationError);
  });
});
