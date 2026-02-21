import { describe, expect, it, vi } from "vitest";

import { createReputationStore } from "./store.js";
import { createRepToken, mintAndDistributeRep } from "./tokens.js";

describe("rep token ops", () => {
  it("creates REP token and distributes minted balance", async () => {
    const store = createReputationStore();

    const repToken = await createRepToken(
      {
        treasuryAccountId: "0.0.1001"
      },
      {
        store,
        deps: {
          associateToken: vi.fn(),
          createFungibleToken: vi.fn().mockResolvedValue({
            tokenId: "0.0.9001",
            tokenUrl: "https://hashscan.io/testnet/token/0.0.9001",
            transactionId: "0.0.1001@1700000000.000001",
            transactionUrl: "https://hashscan.io/testnet/transaction/tx1"
          }),
          mintTokens: vi.fn(),
          transferTokens: vi.fn(),
          now: () => new Date("2026-02-18T00:00:00.000Z")
        }
      }
    );

    expect(repToken.tokenId).toBe("0.0.9001");

    const associateMock = vi.fn().mockResolvedValue({
      tokenId: "0.0.9001",
      tokenUrl: "https://hashscan.io/testnet/token/0.0.9001",
      transactionId: "0.0.1001@1700000000.000004",
      transactionUrl: "https://hashscan.io/testnet/transaction/tx-assoc"
    });
    const mintMock = vi.fn().mockResolvedValue({
      tokenId: "0.0.9001",
      tokenUrl: "https://hashscan.io/testnet/token/0.0.9001",
      transactionId: "0.0.1001@1700000000.000002",
      transactionUrl: "https://hashscan.io/testnet/transaction/tx2"
    });
    const transferMock = vi.fn().mockResolvedValue({
      tokenId: "0.0.9001",
      tokenUrl: "https://hashscan.io/testnet/token/0.0.9001",
      transactionId: "0.0.1001@1700000000.000003",
      transactionUrl: "https://hashscan.io/testnet/transaction/tx3"
    });

    const distribution = await mintAndDistributeRep(
      {
        treasuryAccountId: "0.0.1001",
        recipientAccountId: "0.0.1002",
        amount: 25
      },
      {
        store,
        deps: {
          associateToken: associateMock,
          createFungibleToken: vi.fn(),
          mintTokens: mintMock,
          transferTokens: transferMock,
          now: () => new Date("2026-02-18T00:05:00.000Z")
        }
      }
    );

    expect(distribution.tokenId).toBe("0.0.9001");
    expect(associateMock).toHaveBeenCalledWith("0.0.1002", "0.0.9001", expect.any(Object));
    expect(mintMock).toHaveBeenCalledWith("0.0.9001", 25, expect.any(Object));
    expect(transferMock).toHaveBeenCalledWith(
      "0.0.9001",
      "0.0.1001",
      "0.0.1002",
      25,
      expect.any(Object)
    );
  });

  it("skips association when token is already associated", async () => {
    const store = createReputationStore();

    await createRepToken(
      { treasuryAccountId: "0.0.1001" },
      {
        store,
        deps: {
          associateToken: vi.fn(),
          createFungibleToken: vi.fn().mockResolvedValue({
            tokenId: "0.0.9001",
            tokenUrl: "https://hashscan.io/testnet/token/0.0.9001",
            transactionId: "0.0.1001@1700000000.000001",
            transactionUrl: "https://hashscan.io/testnet/transaction/tx1"
          }),
          mintTokens: vi.fn(),
          transferTokens: vi.fn(),
          now: () => new Date("2026-02-18T00:00:00.000Z")
        }
      }
    );

    const associateMock = vi.fn().mockRejectedValue(
      new Error("TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT")
    );
    const mintMock = vi.fn().mockResolvedValue({
      tokenId: "0.0.9001",
      tokenUrl: "https://hashscan.io/testnet/token/0.0.9001",
      transactionId: "0.0.1001@1700000000.000005",
      transactionUrl: "https://hashscan.io/testnet/transaction/tx5"
    });
    const transferMock = vi.fn().mockResolvedValue({
      tokenId: "0.0.9001",
      tokenUrl: "https://hashscan.io/testnet/token/0.0.9001",
      transactionId: "0.0.1001@1700000000.000006",
      transactionUrl: "https://hashscan.io/testnet/transaction/tx6"
    });

    const distribution = await mintAndDistributeRep(
      {
        treasuryAccountId: "0.0.1001",
        recipientAccountId: "0.0.1002",
        amount: 10
      },
      {
        store,
        deps: {
          associateToken: associateMock,
          createFungibleToken: vi.fn(),
          mintTokens: mintMock,
          transferTokens: transferMock,
          now: () => new Date("2026-02-18T00:10:00.000Z")
        }
      }
    );

    expect(distribution.tokenId).toBe("0.0.9001");
    expect(mintMock).toHaveBeenCalled();
    expect(transferMock).toHaveBeenCalled();
  });
});
