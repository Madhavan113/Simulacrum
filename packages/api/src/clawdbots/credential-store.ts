import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import type { LlmProviderConfig } from "./llm-cognition.js";

interface EncryptedCredentialEntry {
  iv: string;
  authTag: string;
  ciphertext: string;
}

export interface BotCredentialBundle {
  hedera: {
    accountId: string;
    privateKey: string;
    privateKeyType: "der" | "ecdsa" | "ed25519" | "auto";
  };
  llm?: LlmProviderConfig;
  updatedAt: string;
}

export class BotCredentialStoreError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "BotCredentialStoreError";
  }
}

export class EncryptedBotCredentialStore {
  readonly #encryptionKey: Buffer;
  readonly #storage = new Map<string, EncryptedCredentialEntry>();

  constructor(secret: string) {
    if (secret.trim().length === 0) {
      throw new BotCredentialStoreError("Credential store secret must be non-empty.");
    }

    this.#encryptionKey = createHash("sha256").update(secret).digest();
  }

  save(botId: string, credentials: BotCredentialBundle): void {
    if (!botId.trim()) {
      throw new BotCredentialStoreError("botId is required.");
    }

    const payload = JSON.stringify(credentials);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]).toString("base64");
    const authTag = cipher.getAuthTag().toString("base64");
    this.#storage.set(botId, {
      iv: iv.toString("base64"),
      authTag,
      ciphertext
    });
  }

  load(botId: string): BotCredentialBundle | null {
    if (!botId.trim()) {
      throw new BotCredentialStoreError("botId is required.");
    }

    const encrypted = this.#storage.get(botId);

    if (!encrypted) {
      return null;
    }

    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.#encryptionKey,
        Buffer.from(encrypted.iv, "base64")
      );
      decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
      const payload = Buffer.concat([
        decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
        decipher.final()
      ]).toString("utf8");
      return JSON.parse(payload) as BotCredentialBundle;
    } catch (error) {
      throw new BotCredentialStoreError(`Unable to decrypt credentials for bot ${botId}.`, error);
    }
  }

  rotate(botId: string, update: Partial<BotCredentialBundle>): BotCredentialBundle {
    const current = this.load(botId);

    if (!current) {
      throw new BotCredentialStoreError(`No credentials found for bot ${botId}.`);
    }

    const next: BotCredentialBundle = {
      ...current,
      ...update,
      hedera: {
        ...current.hedera,
        ...(update.hedera ?? {})
      },
      llm:
        update.llm === undefined
          ? current.llm
          : {
              ...(current.llm ?? {}),
              ...update.llm
            },
      updatedAt: new Date().toISOString()
    };
    this.save(botId, next);

    return next;
  }

  remove(botId: string): void {
    this.#storage.delete(botId);
  }
}

