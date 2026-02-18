import { describe, expect, it, vi } from "vitest";

import { createInsurancePool, depositLiquidity, reserveCoverage } from "./pools.js";
import { createInsuranceStore } from "./store.js";

const transferMock = vi.fn().mockResolvedValue({
  transactionId: "0.0.1001@1700000000.000001",
  transactionUrl: "https://hashscan.io/testnet/transaction/tx1"
});

const fixedNow = () => new Date("2026-02-18T00:00:00.000Z");

function defaultPoolOpts(store = createInsuranceStore()) {
  return { store, deps: { transferHbar: transferMock, now: fixedNow } };
}

describe("createInsurancePool", () => {
  it("creates pool with correct initial state", async () => {
    const store = createInsuranceStore();
    const pool = await createInsurancePool("0.0.1001", "0.0.5001", 500, defaultPoolOpts(store));

    expect(pool.managerAccountId).toBe("0.0.1001");
    expect(pool.escrowAccountId).toBe("0.0.5001");
    expect(pool.liquidityHbar).toBe(500);
    expect(pool.reservedHbar).toBe(0);
    expect(pool.id).toBeDefined();
    expect(store.pools.has(pool.id)).toBe(true);
  });

  it("calls transferHbar with correct arguments", async () => {
    transferMock.mockClear();
    await createInsurancePool("0.0.1001", "0.0.5001", 300, defaultPoolOpts());

    expect(transferMock).toHaveBeenCalledWith("0.0.1001", "0.0.5001", 300, { client: undefined });
  });

  it("rejects empty managerAccountId", async () => {
    await expect(createInsurancePool("", "0.0.5001", 100, defaultPoolOpts())).rejects.toThrow();
  });

  it("rejects zero initial liquidity", async () => {
    await expect(createInsurancePool("0.0.1001", "0.0.5001", 0, defaultPoolOpts())).rejects.toThrow();
  });

  it("rejects negative initial liquidity", async () => {
    await expect(createInsurancePool("0.0.1001", "0.0.5001", -10, defaultPoolOpts())).rejects.toThrow();
  });
});

describe("depositLiquidity", () => {
  it("increases pool liquidity", async () => {
    const store = createInsuranceStore();
    const pool = await createInsurancePool("0.0.1001", "0.0.5001", 100, defaultPoolOpts(store));

    const updated = await depositLiquidity(pool.id, "0.0.2001", 50, defaultPoolOpts(store));

    expect(updated.liquidityHbar).toBe(150);
  });

  it("throws for unknown pool", async () => {
    await expect(
      depositLiquidity("nonexistent", "0.0.2001", 50, defaultPoolOpts())
    ).rejects.toThrow("was not found");
  });

  it("rejects zero deposit", async () => {
    const store = createInsuranceStore();
    const pool = await createInsurancePool("0.0.1001", "0.0.5001", 100, defaultPoolOpts(store));

    await expect(
      depositLiquidity(pool.id, "0.0.2001", 0, defaultPoolOpts(store))
    ).rejects.toThrow();
  });
});

describe("reserveCoverage", () => {
  it("increases reserved amount", async () => {
    const store = createInsuranceStore();
    const pool = await createInsurancePool("0.0.1001", "0.0.5001", 200, defaultPoolOpts(store));

    const updated = reserveCoverage(pool.id, 100, store);

    expect(updated.reservedHbar).toBe(100);
  });

  it("throws when insufficient available liquidity", async () => {
    const store = createInsuranceStore();
    const pool = await createInsurancePool("0.0.1001", "0.0.5001", 100, defaultPoolOpts(store));

    reserveCoverage(pool.id, 80, store);

    expect(() => reserveCoverage(pool.id, 30, store)).toThrow("insufficient available liquidity");
  });

  it("throws for unknown pool", () => {
    expect(() => reserveCoverage("nonexistent", 10)).toThrow("was not found");
  });

  it("rejects zero amount", async () => {
    const store = createInsuranceStore();
    const pool = await createInsurancePool("0.0.1001", "0.0.5001", 200, defaultPoolOpts(store));

    expect(() => reserveCoverage(pool.id, 0, store)).toThrow();
  });
});
