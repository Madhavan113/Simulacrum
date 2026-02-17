import {
  PrivateKey,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TokenMintTransaction,
  TransferTransaction
} from "@hashgraph/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createHederaClient } from "./client.js";
import {
  HederaTokenError,
  associateToken,
  createFungibleToken,
  createNFT,
  mintTokens,
  transferTokens
} from "./hts.js";

function mockTransactionResponse(transactionId: string, tokenId?: string) {
  return {
    transactionId: { toString: () => transactionId },
    getReceipt: vi.fn().mockResolvedValue(
      tokenId
        ? {
            tokenId: { toString: () => tokenId }
          }
        : {}
    )
  };
}

function buildClient(withOperator = true) {
  if (!withOperator) {
    return createHederaClient({ network: "testnet" });
  }

  return createHederaClient({
    network: "testnet",
    accountId: "0.0.1001",
    privateKey: PrivateKey.generateED25519().toStringDer()
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createFungibleToken", () => {
  it("returns token and HashScan URLs", async () => {
    vi.spyOn(TokenCreateTransaction.prototype, "execute").mockResolvedValue(
      mockTransactionResponse("0.0.1001@1700000000.000001", "0.0.2001") as never
    );

    const result = await createFungibleToken("YES", "YES", 0, 2, {
      client: buildClient()
    });

    expect(result).toEqual({
      tokenId: "0.0.2001",
      tokenUrl: "https://hashscan.io/testnet/token/0.0.2001",
      transactionId: "0.0.1001@1700000000.000001",
      transactionUrl:
        "https://hashscan.io/testnet/transaction/0.0.1001%401700000000.000001"
    });
  });

  it("throws when treasury account cannot be resolved", async () => {
    await expect(
      createFungibleToken("YES", "YES", 0, 2, {
        client: buildClient(false)
      })
    ).rejects.toThrow(HederaTokenError);
  });
});

describe("createNFT", () => {
  it("returns token and HashScan URLs", async () => {
    vi.spyOn(TokenCreateTransaction.prototype, "execute").mockResolvedValue(
      mockTransactionResponse("0.0.1001@1700000000.000002", "0.0.2002") as never
    );

    const result = await createNFT("Agent Identity", "AGENTID", 1000, {
      client: buildClient()
    });

    expect(result).toEqual({
      tokenId: "0.0.2002",
      tokenUrl: "https://hashscan.io/testnet/token/0.0.2002",
      transactionId: "0.0.1001@1700000000.000002",
      transactionUrl:
        "https://hashscan.io/testnet/transaction/0.0.1001%401700000000.000002"
    });
  });
});

describe("mintTokens", () => {
  it("returns transaction and token URLs", async () => {
    vi.spyOn(TokenMintTransaction.prototype, "execute").mockResolvedValue(
      mockTransactionResponse("0.0.1001@1700000000.000003") as never
    );

    const result = await mintTokens("0.0.2001", 500, { client: buildClient() });

    expect(result).toEqual({
      tokenId: "0.0.2001",
      tokenUrl: "https://hashscan.io/testnet/token/0.0.2001",
      transactionId: "0.0.1001@1700000000.000003",
      transactionUrl:
        "https://hashscan.io/testnet/transaction/0.0.1001%401700000000.000003"
    });
  });

  it("validates the mint amount", async () => {
    await expect(mintTokens("0.0.2001", 0, { client: buildClient() })).rejects.toThrow(
      /amount must be a positive integer/
    );
  });
});

describe("transferTokens", () => {
  it("returns transaction and token URLs", async () => {
    vi.spyOn(TransferTransaction.prototype, "execute").mockResolvedValue(
      mockTransactionResponse("0.0.1001@1700000000.000004") as never
    );

    const result = await transferTokens("0.0.2001", "0.0.1001", "0.0.1002", 20, {
      client: buildClient()
    });

    expect(result).toEqual({
      tokenId: "0.0.2001",
      tokenUrl: "https://hashscan.io/testnet/token/0.0.2001",
      transactionId: "0.0.1001@1700000000.000004",
      transactionUrl:
        "https://hashscan.io/testnet/transaction/0.0.1001%401700000000.000004"
    });
  });
});

describe("associateToken", () => {
  it("returns transaction and token URLs", async () => {
    vi.spyOn(TokenAssociateTransaction.prototype, "execute").mockResolvedValue(
      mockTransactionResponse("0.0.1001@1700000000.000005") as never
    );

    const result = await associateToken("0.0.1002", "0.0.2001", {
      client: buildClient()
    });

    expect(result).toEqual({
      tokenId: "0.0.2001",
      tokenUrl: "https://hashscan.io/testnet/token/0.0.2001",
      transactionId: "0.0.1001@1700000000.000005",
      transactionUrl:
        "https://hashscan.io/testnet/transaction/0.0.1001%401700000000.000005"
    });
  });
});
