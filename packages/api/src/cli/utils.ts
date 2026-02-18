import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resetHederaClientForTests } from "@simulacrum/core";

export interface HederaCredentials {
  network: string;
  accountId: string;
  privateKey: string;
  privateKeyType: "auto" | "ecdsa" | "ed25519" | "der";
  keyStoreSecret: string;
}

function parseDotEnv(content: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function findEnvFile(startDir: string): string {
  let current = resolve(startDir);

  while (true) {
    const candidate = resolve(current, ".env");

    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = resolve(current, "..");

    if (parent === current) {
      break;
    }

    current = parent;
  }

  throw new Error("Unable to find .env file from current working directory upward.");
}

export function loadEnvFromDisk(startDir = process.cwd()): string {
  const envPath = findEnvFile(startDir);
  const content = readFileSync(envPath, "utf8");
  const parsed = parseDotEnv(content);

  for (const [key, value] of Object.entries(parsed)) {
    process.env[key] = value;
  }

  return envPath;
}

export function readPrimaryCredentials(): HederaCredentials {
  const network = process.env.HEDERA_NETWORK ?? "testnet";
  const accountId = process.env.HEDERA_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_PRIVATE_KEY;
  const privateKeyType =
    (process.env.HEDERA_PRIVATE_KEY_TYPE as HederaCredentials["privateKeyType"] | undefined) ??
    "auto";
  const keyStoreSecret = process.env.HEDERA_KEYSTORE_SECRET ?? "simulacrum-hackathon-secret";

  if (!accountId || !privateKey) {
    throw new Error("HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY must be set in .env");
  }

  if (privateKey.includes("...")) {
    throw new Error(
      "HEDERA_PRIVATE_KEY appears truncated (contains ...). Use full key from Hedera Portal."
    );
  }

  return {
    network,
    accountId,
    privateKey,
    privateKeyType,
    keyStoreSecret
  };
}

export function setSigner(
  accountId: string,
  privateKey: string,
  network: string,
  privateKeyType: HederaCredentials["privateKeyType"] = "auto"
): void {
  process.env.HEDERA_NETWORK = network;
  process.env.HEDERA_ACCOUNT_ID = accountId;
  process.env.HEDERA_PRIVATE_KEY = privateKey;
  process.env.HEDERA_PRIVATE_KEY_TYPE = privateKeyType;

  // Reset singleton so next SDK call uses the active signer.
  resetHederaClientForTests();
}

export async function requestJson<TBody = unknown>(
  method: string,
  url: string,
  body?: unknown,
  expectedStatus?: number
): Promise<TBody> {
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let parsed: unknown;

  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (expectedStatus !== undefined && response.status !== expectedStatus) {
    throw new Error(
      `Expected ${method} ${url} to return ${expectedStatus}, got ${response.status}. Body: ${text}`
    );
  }

  if (expectedStatus === undefined && response.status >= 400) {
    throw new Error(`Request failed: ${method} ${url} -> ${response.status}. Body: ${text}`);
  }

  return parsed as TBody;
}

export function logStep(message: string): void {
  console.log(`\n[infra] ${message}`);
}

export function isExecutedDirectly(metaUrl: string): boolean {
  return process.argv[1] !== undefined && fileURLToPath(metaUrl) === process.argv[1];
}
