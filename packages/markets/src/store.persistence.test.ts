import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = {
  SIMULACRUM_PERSIST_STATE: process.env.SIMULACRUM_PERSIST_STATE,
  SIMULACRUM_STATE_DIR: process.env.SIMULACRUM_STATE_DIR,
  NODE_ENV: process.env.NODE_ENV
};

afterEach(() => {
  process.env.SIMULACRUM_PERSIST_STATE = originalEnv.SIMULACRUM_PERSIST_STATE;
  process.env.SIMULACRUM_STATE_DIR = originalEnv.SIMULACRUM_STATE_DIR;
  process.env.NODE_ENV = originalEnv.NODE_ENV;
});

describe("market store persistence", () => {
  it("loads persisted market state from disk across module reloads", async () => {
    const stateDir = mkdtempSync(resolve(tmpdir(), "simulacrum-markets-state-"));
    process.env.SIMULACRUM_PERSIST_STATE = "true";
    process.env.SIMULACRUM_STATE_DIR = stateDir;
    process.env.NODE_ENV = "development";

    vi.resetModules();
    const modA = await import("./store.js");
    const storeA = modA.getMarketStore();

    storeA.markets.set("0.0.123", {
      id: "0.0.123",
      question: "Will persistence survive reload?",
      creatorAccountId: "0.0.5001",
      escrowAccountId: "0.0.5001",
      topicId: "0.0.123",
      topicUrl: "https://hashscan.io/testnet/topic/0.0.123",
      closeTime: "2026-12-31T00:00:00.000Z",
      createdAt: "2026-02-18T00:00:00.000Z",
      status: "OPEN",
      outcomes: ["YES", "NO"],
      outcomeTokenIds: { YES: "0.0.7001", NO: "0.0.7002" },
      outcomeTokenUrls: {
        YES: "https://hashscan.io/testnet/token/0.0.7001",
        NO: "https://hashscan.io/testnet/token/0.0.7002"
      }
    });
    modA.persistMarketStore(storeA);

    const stateFile = resolve(stateDir, "markets.json");
    expect(existsSync(stateFile)).toBe(true);

    vi.resetModules();
    const modB = await import("./store.js");
    const storeB = modB.getMarketStore();
    const loadedMarket = storeB.markets.get("0.0.123");

    expect(loadedMarket?.question).toBe("Will persistence survive reload?");

    modB.resetMarketStoreForTests();
    expect(existsSync(stateFile)).toBe(false);

    rmSync(stateDir, { recursive: true, force: true });
  });
});
