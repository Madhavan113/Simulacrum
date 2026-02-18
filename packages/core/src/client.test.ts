import { PrivateKey } from "@hashgraph/sdk";
import { afterEach, describe, expect, it } from "vitest";

import {
  HederaClientError,
  createHederaClient,
  getHederaClient,
  resetHederaClientForTests
} from "./client.js";

const ORIGINAL_ENV = process.env;

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.HEDERA_NETWORK;
  delete process.env.HEDERA_ACCOUNT_ID;
  delete process.env.HEDERA_PRIVATE_KEY;
  delete process.env.HEDERA_PRIVATE_KEY_TYPE;
  resetHederaClientForTests();
});

describe("createHederaClient", () => {
  it("defaults to testnet when HEDERA_NETWORK is unset", () => {
    const client = createHederaClient();

    expect(client.ledgerId?.toString()).toBe("testnet");
  });

  it("supports mainnet and previewnet", () => {
    expect(createHederaClient({ network: "mainnet" }).ledgerId?.toString()).toBe(
      "mainnet"
    );
    expect(
      createHederaClient({ network: "previewnet" }).ledgerId?.toString()
    ).toBe("previewnet");
  });

  it("throws a typed error for unsupported networks", () => {
    process.env.HEDERA_NETWORK = "invalidnet";

    expect(() => createHederaClient()).toThrow(HederaClientError);
    expect(() => createHederaClient()).toThrow(/Invalid HEDERA_NETWORK/);
  });

  it("sets operator from environment when account and private key are both present", () => {
    process.env.HEDERA_ACCOUNT_ID = "0.0.1001";
    process.env.HEDERA_PRIVATE_KEY = PrivateKey.generateED25519().toStringDer();

    const client = createHederaClient();

    expect(client.operatorAccountId?.toString()).toBe("0.0.1001");
  });

  it("supports raw ECDSA keys with 0x prefix", () => {
    process.env.HEDERA_ACCOUNT_ID = "0.0.1001";
    process.env.HEDERA_PRIVATE_KEY = `0x${PrivateKey.generateECDSA().toStringRaw()}`;
    process.env.HEDERA_PRIVATE_KEY_TYPE = "ecdsa";

    const client = createHederaClient();

    expect(client.operatorAccountId?.toString()).toBe("0.0.1001");
  });

  it("throws when only one operator env variable is provided", () => {
    process.env.HEDERA_ACCOUNT_ID = "0.0.1001";
    delete process.env.HEDERA_PRIVATE_KEY;

    expect(() => createHederaClient()).toThrow(HederaClientError);
    expect(() => createHederaClient()).toThrow(
      /Both HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY are required/
    );
  });
});

describe("getHederaClient", () => {
  it("returns the same singleton instance for repeated default calls", () => {
    const first = getHederaClient();
    const second = getHederaClient();

    expect(first).toBe(second);
  });

  it("returns a non-singleton client when overrides are provided", () => {
    const singleton = getHederaClient();
    const overrideClient = getHederaClient({ network: "mainnet" });

    expect(overrideClient).not.toBe(singleton);
    expect(overrideClient.ledgerId?.toString()).toBe("mainnet");
  });
});
