import { Client } from "@hashgraph/sdk";

import { getHederaClient, type HederaNetwork } from "./client.js";

export const HASHSCAN_BASE_URL = "https://hashscan.io";
export const DEFAULT_NETWORK: HederaNetwork = "testnet";
export const TINYBARS_PER_HBAR = 100_000_000n;

export function resolveClient(client?: Client): Client {
  return client ?? getHederaClient();
}

export function resolveNetwork(client: Client): HederaNetwork {
  const network = client.ledgerId?.toString().toLowerCase();

  if (network === "mainnet" || network === "previewnet" || network === "testnet") {
    return network;
  }

  return DEFAULT_NETWORK;
}

export function buildTransactionUrl(network: HederaNetwork, transactionId: string): string {
  return `${HASHSCAN_BASE_URL}/${network}/transaction/${encodeURIComponent(transactionId)}`;
}

export function buildTopicUrl(network: HederaNetwork, topicId: string): string {
  return `${HASHSCAN_BASE_URL}/${network}/topic/${encodeURIComponent(topicId)}`;
}

export function buildTokenUrl(network: HederaNetwork, tokenId: string): string {
  return `${HASHSCAN_BASE_URL}/${network}/token/${encodeURIComponent(tokenId)}`;
}

export function buildAccountUrl(network: HederaNetwork, accountId: string): string {
  return `${HASHSCAN_BASE_URL}/${network}/account/${encodeURIComponent(accountId)}`;
}

export function toTinybars(amount: number): bigint {
  return BigInt(Math.round(amount * Number(TINYBARS_PER_HBAR)));
}
