import { describe, expect, it, vi } from "vitest";

import { processClaim } from "./claims.js";
import { underwriteCommitment } from "./underwrite.js";
import { createInsuranceStore } from "./store.js";

const transferMock = vi.fn().mockResolvedValue({
  transactionId: "0.0.1001@1700000000.000001",
  transactionUrl: "https://hashscan.io/testnet/transaction/tx1"
});

function makePolicy(store = createInsuranceStore(), overrides: Record<string, unknown> = {}) {
  return underwriteCommitment(
    {
      marketId: "0.0.7001",
      underwriterAccountId: "0.0.1001",
      beneficiaryAccountId: "0.0.2001",
      coverageAmountHbar: 100,
      premiumRateBps: 500,
      expirationTime: "2026-12-31T00:00:00.000Z",
      escrowAccountId: "0.0.5001",
      ...overrides
    },
    {
      store,
      deps: {
        transferHbar: transferMock,
        now: () => new Date("2026-02-18T00:00:00.000Z")
      }
    }
  );
}

describe("processClaim", () => {
  it("pays out full coverage by default", async () => {
    const store = createInsuranceStore();
    const policy = await makePolicy(store);

    const claimed = await processClaim(
      { policyId: policy.id, claimantAccountId: "0.0.2001", triggerReason: "triggered" },
      {
        store,
        deps: {
          transferHbar: transferMock,
          now: () => new Date("2026-06-01T00:00:00.000Z")
        }
      }
    );

    expect(claimed.status).toBe("CLAIMED");
    expect(transferMock).toHaveBeenCalledWith("0.0.5001", "0.0.2001", 100, { client: undefined });
  });

  it("pays out partial amount when requested", async () => {
    const store = createInsuranceStore();
    const policy = await makePolicy(store);

    transferMock.mockClear();
    await processClaim(
      {
        policyId: policy.id,
        claimantAccountId: "0.0.2001",
        triggerReason: "partial",
        payoutAmountHbar: 40
      },
      {
        store,
        deps: {
          transferHbar: transferMock,
          now: () => new Date("2026-06-01T00:00:00.000Z")
        }
      }
    );

    expect(transferMock).toHaveBeenCalledWith("0.0.5001", "0.0.2001", 40, { client: undefined });
  });

  it("rejects payout exceeding coverage", async () => {
    const store = createInsuranceStore();
    const policy = await makePolicy(store);

    await expect(
      processClaim(
        {
          policyId: policy.id,
          claimantAccountId: "0.0.2001",
          triggerReason: "too much",
          payoutAmountHbar: 999
        },
        {
          store,
          deps: {
            transferHbar: transferMock,
            now: () => new Date("2026-06-01T00:00:00.000Z")
          }
        }
      )
    ).rejects.toThrow("exceeds policy coverage");
  });

  it("rejects claim on non-existent policy", async () => {
    await expect(
      processClaim(
        { policyId: "nonexistent", claimantAccountId: "0.0.2001", triggerReason: "test" },
        {
          store: createInsuranceStore(),
          deps: {
            transferHbar: transferMock,
            now: () => new Date("2026-06-01T00:00:00.000Z")
          }
        }
      )
    ).rejects.toThrow("was not found");
  });

  it("rejects claim on already-claimed policy", async () => {
    const store = createInsuranceStore();
    const policy = await makePolicy(store);

    await processClaim(
      { policyId: policy.id, claimantAccountId: "0.0.2001", triggerReason: "first" },
      {
        store,
        deps: {
          transferHbar: transferMock,
          now: () => new Date("2026-06-01T00:00:00.000Z")
        }
      }
    );

    await expect(
      processClaim(
        { policyId: policy.id, claimantAccountId: "0.0.2001", triggerReason: "second" },
        {
          store,
          deps: {
            transferHbar: transferMock,
            now: () => new Date("2026-06-01T00:00:00.000Z")
          }
        }
      )
    ).rejects.toThrow("not active");
  });

  it("marks expired policy and rejects claim", async () => {
    const store = createInsuranceStore();
    const policy = await makePolicy(store);

    await expect(
      processClaim(
        { policyId: policy.id, claimantAccountId: "0.0.2001", triggerReason: "late" },
        {
          store,
          deps: {
            transferHbar: transferMock,
            now: () => new Date("2027-06-01T00:00:00.000Z")
          }
        }
      )
    ).rejects.toThrow("expired");

    expect(store.policies.get(policy.id)?.status).toBe("EXPIRED");
  });
});
