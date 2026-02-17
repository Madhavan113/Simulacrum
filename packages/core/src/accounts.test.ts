import {
  AccountCreateTransaction,
  AccountInfoQuery,
  Hbar,
  PrivateKey
} from "@hashgraph/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createHederaClient } from "./client.js";
import {
  EncryptedInMemoryKeyStore,
  HederaAccountError,
  createAccount,
  getAccountInfo,
  getStoredPrivateKey,
  resetDefaultKeyStoreForTests
} from "./accounts.js";

function buildClient() {
  return createHederaClient({
    network: "testnet",
    accountId: "0.0.1001",
    privateKey: PrivateKey.generateED25519().toStringDer()
  });
}

function mockTransactionResponse(transactionId: string, receipt: Record<string, unknown>) {
  return {
    transactionId: { toString: () => transactionId },
    getReceipt: vi.fn().mockResolvedValue(receipt)
  };
}

afterEach(() => {
  delete process.env.HEDERA_KEYSTORE_SECRET;
  resetDefaultKeyStoreForTests();
  vi.restoreAllMocks();
});

describe("createAccount", () => {
  it("creates an account, returns keys, and persists private key to secure store", async () => {
    vi.spyOn(AccountCreateTransaction.prototype, "execute").mockResolvedValue(
      mockTransactionResponse("0.0.1001@1700000000.000001", {
        accountId: { toString: () => "0.0.4001" }
      }) as never
    );

    const keyStore = new EncryptedInMemoryKeyStore("test-secret");
    const result = await createAccount(10, {
      client: buildClient(),
      keyStore
    });
    const storedPrivateKey = await getStoredPrivateKey("0.0.4001", { keyStore });

    expect(result.accountId).toBe("0.0.4001");
    expect(result.accountUrl).toBe("https://hashscan.io/testnet/account/0.0.4001");
    expect(result.publicKey).toMatch(/^302a|^302b/);
    expect(result.privateKey).toMatch(/^302e/);
    expect(result.transactionId).toBe("0.0.1001@1700000000.000001");
    expect(result.transactionUrl).toBe(
      "https://hashscan.io/testnet/transaction/0.0.1001%401700000000.000001"
    );
    expect(storedPrivateKey).toBe(result.privateKey);
  });

  it("throws when secure key storage is not configured", async () => {
    vi.spyOn(AccountCreateTransaction.prototype, "execute").mockResolvedValue(
      mockTransactionResponse("0.0.1001@1700000000.000001", {
        accountId: { toString: () => "0.0.4001" }
      }) as never
    );

    await expect(
      createAccount(10, {
        client: buildClient()
      })
    ).rejects.toThrow(HederaAccountError);
  });
});

describe("getAccountInfo", () => {
  it("returns account details and balance", async () => {
    vi.spyOn(AccountInfoQuery.prototype, "execute").mockResolvedValue({
      accountId: { toString: () => "0.0.4001" },
      key: { toString: () => "302a300506032b6570032100abcdef" },
      balance: new Hbar(25),
      isDeleted: false
    } as never);

    const result = await getAccountInfo("0.0.4001", { client: buildClient() });

    expect(result).toEqual({
      accountId: "0.0.4001",
      accountUrl: "https://hashscan.io/testnet/account/0.0.4001",
      key: "302a300506032b6570032100abcdef",
      balanceHbar: 25,
      balanceTinybar: "2500000000",
      isDeleted: false
    });
  });
});
