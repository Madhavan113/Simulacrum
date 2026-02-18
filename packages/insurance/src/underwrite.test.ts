import { describe, expect, it, vi } from "vitest";

import { quoteCommitmentPremium, underwriteCommitment } from "./underwrite.js";
import { createInsuranceStore } from "./store.js";

const transferMock = vi.fn().mockResolvedValue({
  transactionId: "0.0.1001@1700000000.000001",
  transactionUrl: "https://hashscan.io/testnet/transaction/tx1"
});

const fixedNow = () => new Date("2026-02-18T00:00:00.000Z");

describe("underwriteCommitment", () => {
  it("creates an active policy", async () => {
    const store = createInsuranceStore();
    const policy = await underwriteCommitment(
      {
        marketId: "0.0.7001",
        underwriterAccountId: "0.0.1001",
        beneficiaryAccountId: "0.0.2001",
        coverageAmountHbar: 100,
        premiumRateBps: 500,
        expirationTime: "2026-12-31T00:00:00.000Z",
        escrowAccountId: "0.0.5001"
      },
      { store, deps: { transferHbar: transferMock, now: fixedNow } }
    );

    expect(policy.status).toBe("ACTIVE");
    expect(policy.coverageAmountHbar).toBe(100);
    expect(policy.premiumRateBps).toBe(500);
    expect(store.policies.has(policy.id)).toBe(true);
  });

  it("defaults escrow to underwriter when not specified", async () => {
    const store = createInsuranceStore();
    const policy = await underwriteCommitment(
      {
        marketId: "0.0.7001",
        underwriterAccountId: "0.0.1001",
        beneficiaryAccountId: "0.0.2001",
        coverageAmountHbar: 50,
        premiumRateBps: 300,
        expirationTime: "2026-12-31T00:00:00.000Z"
      },
      { store, deps: { transferHbar: transferMock, now: fixedNow } }
    );

    expect(policy.escrowAccountId).toBe("0.0.1001");
  });

  it("rejects past expiration time", async () => {
    await expect(
      underwriteCommitment(
        {
          marketId: "0.0.7001",
          underwriterAccountId: "0.0.1001",
          beneficiaryAccountId: "0.0.2001",
          coverageAmountHbar: 50,
          premiumRateBps: 300,
          expirationTime: "2020-01-01T00:00:00.000Z"
        },
        { store: createInsuranceStore(), deps: { transferHbar: transferMock, now: fixedNow } }
      )
    ).rejects.toThrow("future");
  });

  it("rejects invalid expiration time", async () => {
    await expect(
      underwriteCommitment(
        {
          marketId: "0.0.7001",
          underwriterAccountId: "0.0.1001",
          beneficiaryAccountId: "0.0.2001",
          coverageAmountHbar: 50,
          premiumRateBps: 300,
          expirationTime: "not-a-date"
        },
        { store: createInsuranceStore(), deps: { transferHbar: transferMock, now: fixedNow } }
      )
    ).rejects.toThrow("valid ISO timestamp");
  });

  it("rejects empty marketId", async () => {
    await expect(
      underwriteCommitment(
        {
          marketId: "",
          underwriterAccountId: "0.0.1001",
          beneficiaryAccountId: "0.0.2001",
          coverageAmountHbar: 50,
          premiumRateBps: 300,
          expirationTime: "2026-12-31T00:00:00.000Z"
        },
        { store: createInsuranceStore(), deps: { transferHbar: transferMock, now: fixedNow } }
      )
    ).rejects.toThrow();
  });
});

describe("quoteCommitmentPremium", () => {
  it("returns premium amount and rate", () => {
    const quote = quoteCommitmentPremium(100, 60, 30, 45);

    expect(quote.premiumAmountHbar).toBeGreaterThan(0);
    expect(quote.premiumRateBps).toBeGreaterThan(0);
  });

  it("returns higher rate for riskier inputs", () => {
    const safe = quoteCommitmentPremium(100, 10, 10, 30);
    const risky = quoteCommitmentPremium(100, 90, 90, 30);

    expect(risky.premiumRateBps).toBeGreaterThan(safe.premiumRateBps);
  });
});
