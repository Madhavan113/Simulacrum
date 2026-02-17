import {
  AccountCreateTransaction,
  AccountId,
  AccountInfoQuery,
  Client,
  Hbar,
  HbarUnit,
  PrivateKey
} from "@hashgraph/sdk";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { getHederaClient, type HederaNetwork } from "./client.js";

const HASHSCAN_BASE_URL = "https://hashscan.io";
const DEFAULT_NETWORK: HederaNetwork = "testnet";
const TINYBARS_PER_HBAR = 100_000_000n;

interface EncryptedKeyEntry {
  iv: string;
  authTag: string;
  ciphertext: string;
}

export interface AccountOperationOptions {
  client?: Client;
}

export interface AccountKeyStore {
  save(accountId: string, privateKeyDer: string): Promise<void>;
  load(accountId: string): Promise<string | null>;
}

export interface AccountStorageOptions extends AccountOperationOptions {
  keyStore?: AccountKeyStore;
}

export interface CreateAccountResult {
  accountId: string;
  accountUrl: string;
  publicKey: string;
  privateKey: string;
  transactionId: string;
  transactionUrl: string;
}

export interface AccountInfoResult {
  accountId: string;
  accountUrl: string;
  key: string;
  balanceHbar: number;
  balanceTinybar: string;
  isDeleted: boolean;
}

export class HederaAccountError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "HederaAccountError";
  }
}

export class EncryptedInMemoryKeyStore implements AccountKeyStore {
  readonly #encryptionKey: Buffer;
  readonly #storage = new Map<string, EncryptedKeyEntry>();

  constructor(secret: string) {
    if (secret.trim().length === 0) {
      throw new HederaAccountError("secret must be a non-empty string.");
    }

    this.#encryptionKey = createHash("sha256").update(secret).digest();
  }

  async save(accountId: string, privateKeyDer: string): Promise<void> {
    validateNonEmptyString(accountId, "accountId");
    validateNonEmptyString(privateKeyDer, "privateKeyDer");

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#encryptionKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(privateKeyDer, "utf8"),
      cipher.final()
    ]).toString("base64");
    const authTag = cipher.getAuthTag().toString("base64");

    this.#storage.set(accountId, {
      iv: iv.toString("base64"),
      authTag,
      ciphertext
    });
  }

  async load(accountId: string): Promise<string | null> {
    validateNonEmptyString(accountId, "accountId");

    const encrypted = this.#storage.get(accountId);

    if (!encrypted) {
      return null;
    }

    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.#encryptionKey,
      Buffer.from(encrypted.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
      decipher.final()
    ]).toString("utf8");
  }
}

let defaultKeyStore: AccountKeyStore | null = null;

function resolveClient(client?: Client): Client {
  return client ?? getHederaClient();
}

function resolveNetwork(client: Client): HederaNetwork {
  const network = client.ledgerId?.toString().toLowerCase();

  if (network === "mainnet" || network === "previewnet" || network === "testnet") {
    return network;
  }

  return DEFAULT_NETWORK;
}

function resolveKeyStore(keyStore?: AccountKeyStore): AccountKeyStore {
  if (keyStore) {
    return keyStore;
  }

  if (defaultKeyStore) {
    return defaultKeyStore;
  }

  const secret = process.env.HEDERA_KEYSTORE_SECRET;

  if (!secret) {
    throw new HederaAccountError(
      "HEDERA_KEYSTORE_SECRET is required for secure key storage when no keyStore is provided."
    );
  }

  defaultKeyStore = new EncryptedInMemoryKeyStore(secret);
  return defaultKeyStore;
}

function buildTransactionUrl(network: HederaNetwork, transactionId: string): string {
  return `${HASHSCAN_BASE_URL}/${network}/transaction/${encodeURIComponent(transactionId)}`;
}

function buildAccountUrl(network: HederaNetwork, accountId: string): string {
  return `${HASHSCAN_BASE_URL}/${network}/account/${encodeURIComponent(accountId)}`;
}

function asHederaAccountError(message: string, error: unknown): HederaAccountError {
  if (error instanceof HederaAccountError) {
    return error;
  }

  return new HederaAccountError(message, error);
}

function validateNonEmptyString(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new HederaAccountError(`${fieldName} must be a non-empty string.`);
  }
}

function validateNonNegativeNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new HederaAccountError(`${fieldName} must be a non-negative number.`);
  }
}

export async function createAccount(
  initialBalance: number,
  options: AccountStorageOptions = {}
): Promise<CreateAccountResult> {
  validateNonNegativeNumber(initialBalance, "initialBalance");

  const client = resolveClient(options.client);
  const keyStore = resolveKeyStore(options.keyStore);

  try {
    const privateKey = PrivateKey.generateED25519();
    const response = await new AccountCreateTransaction()
      .setKey(privateKey.publicKey)
      .setInitialBalance(Hbar.from(initialBalance, HbarUnit.Hbar))
      .execute(client);
    const receipt = await response.getReceipt(client);
    const accountId = receipt.accountId?.toString();

    if (!accountId) {
      throw new HederaAccountError("Account creation completed without an account ID in the receipt.");
    }

    const privateKeyDer = privateKey.toStringDer();
    await keyStore.save(accountId, privateKeyDer);

    const network = resolveNetwork(client);
    const transactionId = response.transactionId.toString();

    return {
      accountId,
      accountUrl: buildAccountUrl(network, accountId),
      publicKey: privateKey.publicKey.toStringDer(),
      privateKey: privateKeyDer,
      transactionId,
      transactionUrl: buildTransactionUrl(network, transactionId)
    };
  } catch (error) {
    throw asHederaAccountError("Failed to create account.", error);
  }
}

export async function getAccountInfo(
  accountId: string,
  options: AccountOperationOptions = {}
): Promise<AccountInfoResult> {
  validateNonEmptyString(accountId, "accountId");

  const client = resolveClient(options.client);

  try {
    const info = await new AccountInfoQuery()
      .setAccountId(AccountId.fromString(accountId))
      .execute(client);
    const tinybars = info.balance.toTinybars().toString();
    const balanceHbar = Number(tinybars) / Number(TINYBARS_PER_HBAR);
    const resolvedAccountId = info.accountId.toString();
    const network = resolveNetwork(client);

    return {
      accountId: resolvedAccountId,
      accountUrl: buildAccountUrl(network, resolvedAccountId),
      key: info.key.toString(),
      balanceHbar,
      balanceTinybar: tinybars,
      isDeleted: info.isDeleted
    };
  } catch (error) {
    throw asHederaAccountError("Failed to fetch account info.", error);
  }
}

export async function getStoredPrivateKey(
  accountId: string,
  options: AccountStorageOptions = {}
): Promise<string | null> {
  validateNonEmptyString(accountId, "accountId");

  const keyStore = resolveKeyStore(options.keyStore);
  return keyStore.load(accountId);
}

export function resetDefaultKeyStoreForTests(): void {
  defaultKeyStore = null;
}
