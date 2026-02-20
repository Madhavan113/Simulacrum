import { randomUUID } from "node:crypto";

import { createTopic, submitMessage, validateNonEmptyString, validatePositiveInteger } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";

import { getCoordinationStore, persistCoordinationStore, type CoordinationStore } from "./store.js";
import {
  type CollectiveCommitment,
  CoordinationError
} from "./types.js";

interface CommitmentDependencies {
  createTopic: typeof createTopic;
  submitMessage: typeof submitMessage;
  now: () => Date;
}

export interface CreateCommitmentInput {
  name: string;
  description?: string;
  creatorAccountId: string;
  requiredParticipants: number;
  deadline: string;
}

export interface CommitmentOptions {
  client?: Client;
  store?: CoordinationStore;
  deps?: Partial<CommitmentDependencies>;
}

function toCoordinationError(message: string, error: unknown): CoordinationError {
  if (error instanceof CoordinationError) {
    return error;
  }

  return new CoordinationError(message, error);
}

export async function createCollectiveCommitment(
  input: CreateCommitmentInput,
  options: CommitmentOptions = {}
): Promise<CollectiveCommitment> {
  validateNonEmptyString(input.name, "name");
  validateNonEmptyString(input.creatorAccountId, "creatorAccountId");
  validatePositiveInteger(input.requiredParticipants, "requiredParticipants");

  if (!Number.isFinite(Date.parse(input.deadline))) {
    throw new CoordinationError("deadline must be a valid ISO timestamp.");
  }

  const deps: CommitmentDependencies = {
    createTopic,
    submitMessage,
    now: () => new Date(),
    ...options.deps
  };
  const store = getCoordinationStore(options.store);

  try {
    const topic = await deps.createTopic(`COMMITMENT:${input.name}`, undefined, {
      client: options.client
    });

    const commitment: CollectiveCommitment = {
      id: randomUUID(),
      name: input.name,
      description: input.description,
      creatorAccountId: input.creatorAccountId,
      requiredParticipants: input.requiredParticipants,
      participantIds: [input.creatorAccountId],
      completedBy: [],
      deadline: input.deadline,
      createdAt: deps.now().toISOString(),
      status: input.requiredParticipants === 1 ? "ACTIVE" : "OPEN",
      topicId: topic.topicId,
      topicUrl: topic.topicUrl
    };

    store.commitments.set(commitment.id, commitment);
    persistCoordinationStore(store);

    return commitment;
  } catch (error) {
    throw toCoordinationError("Failed to create collective commitment.", error);
  }
}

export async function joinCommitment(
  commitmentId: string,
  participantAccountId: string,
  options: CommitmentOptions = {}
): Promise<CollectiveCommitment> {
  validateNonEmptyString(commitmentId, "commitmentId");
  validateNonEmptyString(participantAccountId, "participantAccountId");

  const deps: CommitmentDependencies = {
    createTopic,
    submitMessage,
    now: () => new Date(),
    ...options.deps
  };
  const store = getCoordinationStore(options.store);
  const commitment = store.commitments.get(commitmentId);

  if (!commitment) {
    throw new CoordinationError(`Commitment ${commitmentId} was not found.`);
  }

  if (Date.now() > Date.parse(commitment.deadline)) {
    commitment.status = "FAILED";
    persistCoordinationStore(store);
    throw new CoordinationError(`Commitment ${commitmentId} deadline has passed.`);
  }

  if (commitment.status === "COMPLETED" || commitment.status === "FAILED") {
    throw new CoordinationError(`Commitment ${commitmentId} is no longer accepting participants.`);
  }

  if (!commitment.participantIds.includes(participantAccountId)) {
    commitment.participantIds.push(participantAccountId);
  }

  if (commitment.participantIds.length >= commitment.requiredParticipants) {
    commitment.status = "ACTIVE";
  }

  if (commitment.topicId) {
    await deps.submitMessage(
      commitment.topicId,
      {
        type: "COMMITMENT_JOINED",
        commitmentId,
        participantAccountId,
        participants: commitment.participantIds,
        status: commitment.status,
        createdAt: deps.now().toISOString()
      },
      {
        client: options.client
      }
    );
  }

  persistCoordinationStore(store);

  return commitment;
}

export async function completeCommitment(
  commitmentId: string,
  participantAccountId: string,
  options: CommitmentOptions = {}
): Promise<CollectiveCommitment> {
  validateNonEmptyString(commitmentId, "commitmentId");
  validateNonEmptyString(participantAccountId, "participantAccountId");

  const deps: CommitmentDependencies = {
    createTopic,
    submitMessage,
    now: () => new Date(),
    ...options.deps
  };
  const store = getCoordinationStore(options.store);
  const commitment = store.commitments.get(commitmentId);

  if (!commitment) {
    throw new CoordinationError(`Commitment ${commitmentId} was not found.`);
  }

  if (commitment.status === "FAILED") {
    throw new CoordinationError(`Commitment ${commitmentId} has failed and cannot be completed.`);
  }

  if (Date.now() > Date.parse(commitment.deadline)) {
    commitment.status = "FAILED";
    persistCoordinationStore(store);
    throw new CoordinationError(`Commitment ${commitmentId} deadline has passed.`);
  }

  if (!commitment.participantIds.includes(participantAccountId)) {
    throw new CoordinationError(`Participant ${participantAccountId} is not part of ${commitmentId}.`);
  }

  if (!commitment.completedBy.includes(participantAccountId)) {
    commitment.completedBy.push(participantAccountId);
  }

  if (commitment.completedBy.length >= commitment.requiredParticipants) {
    commitment.status = "COMPLETED";
  }

  if (commitment.topicId) {
    await deps.submitMessage(
      commitment.topicId,
      {
        type: "COMMITMENT_COMPLETED",
        commitmentId,
        participantAccountId,
        completedBy: commitment.completedBy,
        status: commitment.status,
        createdAt: deps.now().toISOString()
      },
      {
        client: options.client
      }
    );
  }

  persistCoordinationStore(store);

  return commitment;
}
