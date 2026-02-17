import { AccountId, Client, PrivateKey } from "@hashgraph/sdk";

export type HederaNetwork = "testnet" | "mainnet" | "previewnet";

export interface HederaClientConfig {
  network: HederaNetwork;
  accountId?: string;
  privateKey?: string;
}

export class HederaClientError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "HederaClientError";
  }
}

let clientInstance: Client | null = null;

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

    const client = clientForNetwork(network);

    if ((accountId && !privateKey) || (!accountId && privateKey)) {
      throw new HederaClientError(
        "Both HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY are required when setting an operator."
      );
    }

    if (accountId && privateKey) {
      const parsedAccountId = AccountId.fromString(accountId);
      const parsedPrivateKey = PrivateKey.fromString(privateKey);
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
