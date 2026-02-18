import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import type { AgentWalletCredentials, AgentWalletRecord, EncryptedValue } from "./types.js";

export class AgentWalletStoreError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "AgentWalletStoreError";
  }
}

function validateNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new AgentWalletStoreError(`${field} must be a non-empty string.`);
  }
}

export class EncryptedAgentWalletStore {
  readonly #encryptionKey: Buffer;

  constructor(secret: string) {
    validateNonEmpty(secret, "secret");
    this.#encryptionKey = createHash("sha256").update(secret).digest();
  }

  encryptValue(value: string): EncryptedValue {
    validateNonEmpty(value, "value");

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]).toString("base64");
    const authTag = cipher.getAuthTag().toString("base64");

    return {
      iv: iv.toString("base64"),
      authTag,
      ciphertext
    };
  }

  decryptValue(value: EncryptedValue): string {
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.#encryptionKey,
        Buffer.from(value.iv, "base64")
      );
      decipher.setAuthTag(Buffer.from(value.authTag, "base64"));

      return Buffer.concat([
        decipher.update(Buffer.from(value.ciphertext, "base64")),
        decipher.final()
      ]).toString("utf8");
    } catch (error) {
      throw new AgentWalletStoreError("Failed to decrypt wallet material.", error);
    }
  }

  toStoredRecord(wallet: AgentWalletCredentials): AgentWalletRecord {
    validateNonEmpty(wallet.accountId, "wallet.accountId");
    validateNonEmpty(wallet.privateKey, "wallet.privateKey");

    const now = new Date().toISOString();

    return {
      accountId: wallet.accountId,
      privateKeyType: wallet.privateKeyType,
      privateKeyEncrypted: this.encryptValue(wallet.privateKey),
      createdAt: now,
      updatedAt: now
    };
  }

  fromStoredRecord(record: AgentWalletRecord): AgentWalletCredentials {
    return {
      accountId: record.accountId,
      privateKeyType: record.privateKeyType,
      privateKey: this.decryptValue(record.privateKeyEncrypted)
    };
  }
}

