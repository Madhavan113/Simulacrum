import { randomUUID } from "node:crypto";

import { createTopic, getMessages, submitMessage } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";

import { getReputationStore, persistReputationStore, type ReputationStore } from "./store.js";
import { ReputationError, type ReputationAttestation } from "./types.js";

interface AttestationDependencies {
  createTopic: typeof createTopic;
  submitMessage: typeof submitMessage;
  getMessages: typeof getMessages;
  now: () => Date;
}

export interface EnsureAttestationTopicOptions {
  client?: Client;
  store?: ReputationStore;
  deps?: Partial<AttestationDependencies>;
}

export interface CreateAttestationInput {
  subjectAccountId: string;
  attesterAccountId: string;
  scoreDelta: number;
  confidence?: number;
  reason?: string;
  tags?: readonly string[];
}

export interface CreateAttestationOptions extends EnsureAttestationTopicOptions {
  topicId?: string;
}

function validateNonEmptyString(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new ReputationError(`${field} must be a non-empty string.`);
  }
}

function validateFiniteNumber(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new ReputationError(`${field} must be a finite number.`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseAttestation(message: string): ReputationAttestation | null {
  try {
    const parsed = JSON.parse(message) as Partial<ReputationAttestation>;

    if (
      parsed &&
      typeof parsed.id === "string" &&
      typeof parsed.subjectAccountId === "string" &&
      typeof parsed.attesterAccountId === "string" &&
      typeof parsed.scoreDelta === "number" &&
      typeof parsed.confidence === "number" &&
      typeof parsed.createdAt === "string"
    ) {
      return {
        id: parsed.id,
        topicId: typeof parsed.topicId === "string" ? parsed.topicId : "",
        topicUrl: parsed.topicUrl,
        subjectAccountId: parsed.subjectAccountId,
        attesterAccountId: parsed.attesterAccountId,
        scoreDelta: parsed.scoreDelta,
        confidence: parsed.confidence,
        reason: parsed.reason,
        tags: Array.isArray(parsed.tags) ? parsed.tags.map((tag) => String(tag)) : [],
        createdAt: parsed.createdAt,
        sequenceNumber: parsed.sequenceNumber,
        transactionId: parsed.transactionId,
        transactionUrl: parsed.transactionUrl
      };
    }
  } catch {
    return null;
  }

  return null;
}

function toReputationError(message: string, error: unknown): ReputationError {
  if (error instanceof ReputationError) {
    return error;
  }

  return new ReputationError(message, error);
}

export async function ensureAttestationTopic(
  options: EnsureAttestationTopicOptions = {}
): Promise<{ topicId: string; topicUrl: string }> {
  const store = getReputationStore(options.store);

  if (store.topicId && store.topicUrl) {
    return { topicId: store.topicId, topicUrl: store.topicUrl };
  }

  const deps: AttestationDependencies = {
    createTopic,
    submitMessage,
    getMessages,
    now: () => new Date(),
    ...options.deps
  };

  try {
    const topic = await deps.createTopic("Simulacrum Reputation Attestations", undefined, {
      client: options.client
    });
    store.topicId = topic.topicId;
    store.topicUrl = topic.topicUrl;
    persistReputationStore(store);

    return {
      topicId: topic.topicId,
      topicUrl: topic.topicUrl
    };
  } catch (error) {
    throw toReputationError("Failed to create attestation topic.", error);
  }
}

export async function submitAttestation(
  input: CreateAttestationInput,
  options: CreateAttestationOptions = {}
): Promise<ReputationAttestation> {
  validateNonEmptyString(input.subjectAccountId, "subjectAccountId");
  validateNonEmptyString(input.attesterAccountId, "attesterAccountId");
  validateFiniteNumber(input.scoreDelta, "scoreDelta");

  const deps: AttestationDependencies = {
    createTopic,
    submitMessage,
    getMessages,
    now: () => new Date(),
    ...options.deps
  };

  const store = getReputationStore(options.store);
  const topic = options.topicId
    ? { topicId: options.topicId, topicUrl: store.topicUrl ?? "" }
    : await ensureAttestationTopic(options);

  const attestation: ReputationAttestation = {
    id: randomUUID(),
    topicId: topic.topicId,
    topicUrl: topic.topicUrl,
    subjectAccountId: input.subjectAccountId,
    attesterAccountId: input.attesterAccountId,
    scoreDelta: clamp(input.scoreDelta, -100, 100),
    confidence: clamp(input.confidence ?? 0.7, 0, 1),
    reason: input.reason,
    tags: (input.tags ?? []).map((tag) => tag.trim()).filter((tag) => tag.length > 0),
    createdAt: deps.now().toISOString()
  };

  try {
    const audit = await deps.submitMessage(
      topic.topicId,
      attestation as unknown as Record<string, unknown>,
      {
        client: options.client
      }
    );

    attestation.transactionId = audit.transactionId;
    attestation.transactionUrl = audit.transactionUrl;
    attestation.sequenceNumber = audit.sequenceNumber;
    store.attestations.push(attestation);
    persistReputationStore(store);

    return attestation;
  } catch (error) {
    throw toReputationError("Failed to submit attestation.", error);
  }
}

export async function listAttestations(
  topicId: string,
  options: EnsureAttestationTopicOptions = {}
): Promise<ReputationAttestation[]> {
  validateNonEmptyString(topicId, "topicId");

  const deps: AttestationDependencies = {
    createTopic,
    submitMessage,
    getMessages,
    now: () => new Date(),
    ...options.deps
  };

  try {
    const result = await deps.getMessages(topicId, { client: options.client, order: "asc" });

    return result.messages
      .map((message) => parseAttestation(message.message))
      .filter((value): value is ReputationAttestation => value !== null)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  } catch (error) {
    throw toReputationError(`Failed to list attestations for topic ${topicId}.`, error);
  }
}
