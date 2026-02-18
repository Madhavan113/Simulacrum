import { describe, expect, it, vi } from "vitest";

import { processClaim } from "./claims.js";
import { calculatePremium } from "./premiums.js";
import { createInsurancePool, depositLiquidity, reserveCoverage } from "./pools.js";
import { createInsuranceStore } from "./store.js";
import { quoteCommitmentPremium, underwriteCommitment } from "./underwrite.js";

describe("insurance flows", () => {
  it("quotes premium and underwrites policy", async () => {
    const quote = quoteCommitmentPremium(100, 60, 30, 45);

    expect(quote.premiumRateBps).toBeGreaterThan(300);

    const store = createInsuranceStore();
    const transferMock = vi.fn().mockResolvedValue({
      transactionId: "0.0.1001@1700000000.000001",
      transactionUrl: "https://hashscan.io/testnet/transaction/tx1"
    });

    const policy = await underwriteCommitment(
      {
        marketId: "0.0.7001",
        underwriterAccountId: "0.0.1001",
        beneficiaryAccountId: "0.0.2001",
        coverageAmountHbar: 100,
        premiumRateBps: quote.premiumRateBps,
        expirationTime: "2026-12-31T00:00:00.000Z",
        escrowAccountId: "0.0.5001"
      },
      {
        store,
        deps: {
          transferHbar: transferMock,
          now: () => new Date("2026-02-18T00:00:00.000Z")
        }
      }
    );

    expect(policy.status).toBe("ACTIVE");
    expect(policy.coverageAmountHbar).toBe(100);
  });

  it("manages pool and reserves coverage", async () => {
    const store = createInsuranceStore();
    const transferMock = vi.fn().mockResolvedValue({
      transactionId: "0.0.1001@1700000000.000010",
      transactionUrl: "https://hashscan.io/testnet/transaction/tx10"
    });

    const pool = await createInsurancePool("0.0.1001", "0.0.5001", 500, {
      store,
      deps: {
        transferHbar: transferMock,
        now: () => new Date("2026-02-18T00:00:00.000Z")
      }
    });

    await depositLiquidity(pool.id, "0.0.1002", 200, {
      store,
      deps: {
        transferHbar: transferMock,
        now: () => new Date("2026-02-18T01:00:00.000Z")
      }
    });

    const reserved = reserveCoverage(pool.id, 250, store);
    expect(reserved.reservedHbar).toBe(250);
    expect(reserved.liquidityHbar).toBe(700);
  });

  it("processes a claim", async () => {
    const store = createInsuranceStore();
    const transferMock = vi.fn().mockResolvedValue({
      transactionId: "0.0.1001@1700000000.000020",
      transactionUrl: "https://hashscan.io/testnet/transaction/tx20"
    });

    const policy = await underwriteCommitment(
      {
        marketId: "0.0.7001",
        underwriterAccountId: "0.0.1001",
        beneficiaryAccountId: "0.0.2001",
        coverageAmountHbar: 80,
        premiumRateBps: 600,
        expirationTime: "2026-12-31T00:00:00.000Z",
        escrowAccountId: "0.0.5002"
      },
      {
        store,
        deps: {
          transferHbar: transferMock,
          now: () => new Date("2026-02-18T00:00:00.000Z")
        }
      }
    );

    const claimed = await processClaim(
      {
        policyId: policy.id,
        claimantAccountId: "0.0.2001",
        triggerReason: "Market outcome triggered"
      },
      {
        store,
        deps: {
          transferHbar: transferMock,
          now: () => new Date("2026-02-18T00:10:00.000Z")
        }
      }
    );

    expect(claimed.status).toBe("CLAIMED");
  });

  it("calculates premium with direct helper", () => {
    const quote = calculatePremium({
      coverageAmountHbar: 120,
      riskScore: 40,
      marketVolatility: 50,
      durationDays: 60
    });

    expect(quote.premiumAmountHbar).toBeGreaterThan(0);
  });
});
