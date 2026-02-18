import { AccountId, Client, PrivateKey } from "@hashgraph/sdk";

export type HederaNetwork = "testnet" | "mainnet" | "previewnet";

export interface HederaClientConfig {
  network: HederaNetwork;
  accountId?: string;
  privateKey?: string;
  privateKeyType?: "auto" | "ecdsa" | "ed25519" | "der";
}

export class HederaClientError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "HederaClientError";
  }
}

let clientInstance: Client | null = null;

function stripHexPrefix(value: string): string {
  return value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
}

function isHex(value: string): boolean {
  return /^[0-9A-Fa-f]+$/.test(value);
}

function parsePrivateKey(
  privateKey: string,
  privateKeyType: HederaClientConfig["privateKeyType"] = "auto"
): PrivateKey {
  const rawValue = privateKey.trim();
  const normalized = stripHexPrefix(rawValue);

  const parseAsEcdsa = (): PrivateKey => PrivateKey.fromStringECDSA(normalized);
  const parseAsEd25519 = (): PrivateKey => PrivateKey.fromStringED25519(normalized);
  const parseAsDer = (): PrivateKey => PrivateKey.fromStringDer(normalized);

  if (privateKeyType === "ecdsa") {
    return parseAsEcdsa();
  }

  if (privateKeyType === "ed25519") {
    return parseAsEd25519();
  }

  if (privateKeyType === "der") {
    return parseAsDer();
  }

  const attempts: Array<() => PrivateKey> = [];

  if (isHex(normalized)) {
    if (normalized.startsWith("302e") || normalized.startsWith("3030")) {
      attempts.push(parseAsDer);
    }

    if (rawValue.startsWith("0x") || rawValue.startsWith("0X")) {
      attempts.push(parseAsEcdsa, parseAsEd25519);
    } else if (normalized.length === 64) {
      attempts.push(parseAsEcdsa, parseAsEd25519);
    } else {
      attempts.push(parseAsDer);
    }
  }

  attempts.push(() => PrivateKey.fromString(rawValue));

  const seen = new Set<string>();

  for (const attempt of attempts) {
    const key = attempt.toString();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    try {
      return attempt();
    } catch {
      // Try next format.
    }
  }

  throw new HederaClientError(
    "Unable to parse HEDERA_PRIVATE_KEY. Set HEDERA_PRIVATE_KEY_TYPE to ecdsa, ed25519, or der if needed."
  );
}

function parseNetwork(network: string | undefined): HederaNetwork {
  const normalized = (network ?? "testnet").toLowerCase();

  if (
    normalized !== "testnet" &&
    normalized !== "mainnet" &&
    normalized !== "previewnet"
  ) {
    throw new HederaClientError(
      `Invalid HEDERA_NETWORK "${network}". Expected one of: testnet, mainnet, previewnet.`
    );
  }

  return normalized;
}

function clientForNetwork(network: HederaNetwork): Client {
  switch (network) {
    case "mainnet":
      return Client.forMainnet();
    case "previewnet":
      return Client.forPreviewnet();
    case "testnet":
    default:
      return Client.forTestnet();
  }
}

export function createHederaClient(
  overrides: Partial<HederaClientConfig> = {}
): Client {
  try {
    const network = parseNetwork(overrides.network ?? process.env.HEDERA_NETWORK);
    const accountId = overrides.accountId ?? process.env.HEDERA_ACCOUNT_ID;
    const privateKey = overrides.privateKey ?? process.env.HEDERA_PRIVATE_KEY;
    const privateKeyType =
      overrides.privateKeyType ??
      (process.env.HEDERA_PRIVATE_KEY_TYPE as HederaClientConfig["privateKeyType"] | undefined) ??
      "auto";

    const client = clientForNetwork(network);

    if ((accountId && !privateKey) || (!accountId && privateKey)) {
      throw new HederaClientError(
        "Both HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY are required when setting an operator."
      );
    }

    if (accountId && privateKey) {
      const parsedAccountId = AccountId.fromString(accountId);
      const parsedPrivateKey = parsePrivateKey(privateKey, privateKeyType);
      client.setOperator(parsedAccountId, parsedPrivateKey);
    }

    return client;
  } catch (error) {
    if (error instanceof HederaClientError) {
      throw error;
    }

    throw new HederaClientError(
      "Failed to initialize Hedera client from environment configuration.",
      error
    );
  }
}

export function getHederaClient(overrides: Partial<HederaClientConfig> = {}): Client {
  const useSingleton = Object.keys(overrides).length === 0;

  if (useSingleton && clientInstance) {
    return clientInstance;
  }

  const client = createHederaClient(overrides);

  if (useSingleton) {
    clientInstance = client;
  }

  return client;
}

export function resetHederaClientForTests(): void {
  if (clientInstance) {
    clientInstance.close();
    clientInstance = null;
  }
}

export const hederaClient: Client = getHederaClient();
