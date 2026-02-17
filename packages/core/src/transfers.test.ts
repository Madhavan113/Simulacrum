import {
  AccountBalanceQuery,
  Hbar,
  PrivateKey,
  TransferTransaction
} from "@hashgraph/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createHederaClient } from "./client.js";
import {
  HederaTransferError,
  getBalance,
  multiTransfer,
  transferHbar
} from "./transfers.js";

function buildClient() {
  return createHederaClient({
    network: "testnet",
    accountId: "0.0.1001",
    privateKey: PrivateKey.generateED25519().toStringDer()
  });
}

function mockTransactionResponse(transactionId: string) {
  return {
    transactionId: { toString: () => transactionId },
    getReceipt: vi.fn().mockResolvedValue({})
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("transferHbar", () => {
  it("returns transaction id and HashScan URL", async () => {
    vi.spyOn(TransferTransaction.prototype, "execute").mockResolvedValue(
      mockTransactionResponse("0.0.1001@1700000000.000001") as never
    );

    const result = await transferHbar("0.0.1001", "0.0.1002", 10, {
      client: buildClient()
    });

    expect(result).toEqual({
      transactionId: "0.0.1001@1700000000.000001",
      transactionUrl:
        "https://hashscan.io/testnet/transaction/0.0.1001%401700000000.000001"
    });
  });
});

describe("multiTransfer", () => {
  it("returns transaction id and HashScan URL for valid transfer sets", async () => {
    vi.spyOn(TransferTransaction.prototype, "execute").mockResolvedValue(
      mockTransactionResponse("0.0.1001@1700000000.000002") as never
    );

    const result = await multiTransfer(
      [
        { accountId: "0.0.1001", amount: -25 },
        { accountId: "0.0.1002", amount: 10 },
        { accountId: "0.0.1003", amount: 15 }
      ],
      { client: buildClient() }
    );

    expect(result).toEqual({
      transactionId: "0.0.1001@1700000000.000002",
      transactionUrl:
        "https://hashscan.io/testnet/transaction/0.0.1001%401700000000.000002"
    });
  });

  it("throws when transfers do not net to zero", async () => {
    await expect(
      multiTransfer(
        [
          { accountId: "0.0.1001", amount: -10 },
          { accountId: "0.0.1002", amount: 9 }
        ],
        { client: buildClient() }
      )
    ).rejects.toThrow(HederaTransferError);
  });
});

describe("getBalance", () => {
  it("returns account balance in hbar and tinybar", async () => {
    vi.spyOn(AccountBalanceQuery.prototype, "execute").mockResolvedValue({
      hbars: new Hbar(12.5)
    } as never);

    const result = await getBalance("0.0.1001", { client: buildClient() });

    expect(result).toEqual({
      accountId: "0.0.1001",
      hbar: 12.5,
      tinybar: "1250000000"
    });
  });
});
