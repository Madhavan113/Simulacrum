/**
 * Records service transactions on-chain through Moltbook's social layer.
 *
 * Each Service Agent posts to the "services" submolt when a transaction is
 * initiated and again when it is fulfilled, building a public on-chain
 * service record / reputation.
 */

import { MoltbookClient, MoltbookError } from "./client.js";

// ---------------------------------------------------------------------------
// Configuration — maps provider account IDs to their Moltbook API keys
// ---------------------------------------------------------------------------

export interface MoltbookAgentKey {
  providerAccountId: string;
  apiKey: string;
}

const agentKeys = new Map<string, string>();
let defaultApiKey: string | null = null;

/**
 * Register a Moltbook API key for a service agent.
 * Called once per agent at startup.
 */
export function registerMoltbookAgent(providerAccountId: string, apiKey: string): void {
  agentKeys.set(providerAccountId, apiKey);
}

/**
 * Bulk-register from env vars.
 * Expects comma-separated pairs: `accountId:apiKey,accountId:apiKey,...`
 *
 * Also reads MOLTBOOK_API_KEY as a global default so dynamically-created
 * bot accounts that don't have their own key still post through a shared
 * Moltbook identity.
 */
export function registerMoltbookAgentsFromEnv(): void {
  // Global default key — used when a bot has no per-account key
  defaultApiKey = process.env.MOLTBOOK_API_KEY ?? null;

  const raw = process.env.MOLTBOOK_AGENT_KEYS;
  if (raw) {
    for (const pair of raw.split(",")) {
      const sep = pair.indexOf(":");
      if (sep === -1) continue;
      const accountId = pair.slice(0, sep).trim();
      const apiKey = pair.slice(sep + 1).trim();
      if (accountId && apiKey) {
        registerMoltbookAgent(accountId, apiKey);
        // Use the first key we see as the default if no explicit default
        if (!defaultApiKey) defaultApiKey = apiKey;
      }
    }
  }

  // Also support individual per-category env vars
  const categories = ["COMPUTE", "DATA", "RESEARCH", "ANALYSIS", "ORACLE"] as const;
  for (const cat of categories) {
    const accountId = process.env[`MOLTBOOK_${cat}_ACCOUNT_ID`];
    const apiKey = process.env[`MOLTBOOK_${cat}_API_KEY`];
    if (accountId && apiKey) {
      registerMoltbookAgent(accountId, apiKey);
    }
  }

  const keyCount = agentKeys.size + (defaultApiKey ? 1 : 0);
  if (keyCount > 0) {
    console.log(`[moltbook] Loaded ${agentKeys.size} agent key(s)${defaultApiKey ? " + default key" : ""}`);
  }
}

function getClientForProvider(providerAccountId: string): MoltbookClient | null {
  const apiKey = agentKeys.get(providerAccountId) ?? defaultApiKey;
  if (!apiKey) return null;
  return new MoltbookClient({
    apiKey,
    baseUrl: process.env.MOLTBOOK_API_BASE_URL,
  });
}

// ---------------------------------------------------------------------------
// Transaction recording
// ---------------------------------------------------------------------------

export interface ServiceTransactionInfo {
  buyer: string;
  provider: string;
  serviceId: string;
  serviceName: string;
  requestId: string;
  amount: number;
}

/**
 * Record an INITIATED service transaction on Moltbook at the moment of
 * payment confirmation. Fire-and-forget — failures are logged but never
 * block the buy flow.
 */
export async function recordServiceInitiated(tx: ServiceTransactionInfo): Promise<void> {
  const client = getClientForProvider(tx.provider);
  if (!client) return;

  try {
    await client.posts.create({
      submolt: "services",
      title: `${tx.serviceName} — Service Request`,
      content: JSON.stringify({
        buyer: tx.buyer,
        provider: tx.provider,
        service: tx.serviceId,
        requestId: tx.requestId,
        amount: tx.amount,
        status: "INITIATED",
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (error) {
    const msg = error instanceof MoltbookError ? error.message : String(error);
    console.error(`[moltbook] failed to record INITIATED for request ${tx.requestId}: ${msg}`);
  }
}

/**
 * Record a FULFILLED service transaction on Moltbook when the service
 * agent has completed the work. Includes a summary/hash of the output.
 */
export async function recordServiceFulfilled(
  tx: ServiceTransactionInfo & { outputSummary: string },
): Promise<void> {
  const client = getClientForProvider(tx.provider);
  if (!client) return;

  try {
    await client.posts.create({
      submolt: "services",
      title: `${tx.serviceName} — Fulfilled`,
      content: JSON.stringify({
        buyer: tx.buyer,
        provider: tx.provider,
        service: tx.serviceId,
        requestId: tx.requestId,
        amount: tx.amount,
        status: "FULFILLED",
        outputSummary: tx.outputSummary,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (error) {
    const msg = error instanceof MoltbookError ? error.message : String(error);
    console.error(`[moltbook] failed to record FULFILLED for request ${tx.requestId}: ${msg}`);
  }
}
