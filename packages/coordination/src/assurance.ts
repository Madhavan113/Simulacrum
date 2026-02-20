import { randomUUID } from "node:crypto";

import { createTopic, submitMessage, transferHbar, validateNonEmptyString, validatePositiveNumber } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";

import { getCoordinationStore, persistCoordinationStore, type CoordinationStore } from "./store.js";
import {
  type AssuranceContract,
  type AssurancePledge,
  CoordinationError
} from "./types.js";

interface AssuranceDependencies {
  transferHbar: typeof transferHbar;
  createTopic: typeof createTopic;
  submitMessage: typeof submitMessage;
  now: () => Date;
}

export interface CreateAssuranceInput {
  title: string;
  description?: string;
  organizerAccountId: string;
  escrowAccountId?: string;
  thresholdHbar: number;
  deadline: string;
}

export interface AssuranceOptions {
  client?: Client;
  store?: CoordinationStore;
  deps?: Partial<AssuranceDependencies>;
}

function toCoordinationError(message: string, error: unknown): CoordinationError {
  if (error instanceof CoordinationError) {
    return error;
  }

  return new CoordinationError(message, error);
}

export async function createAssuranceContract(
  input: CreateAssuranceInput,
  options: AssuranceOptions = {}
): Promise<AssuranceContract> {
  validateNonEmptyString(input.title, "title");
  validateNonEmptyString(input.organizerAccountId, "organizerAccountId");
  validatePositiveNumber(input.thresholdHbar, "thresholdHbar");

  const deadlineTime = Date.parse(input.deadline);

  if (!Number.isFinite(deadlineTime)) {
    throw new CoordinationError("deadline must be a valid ISO timestamp.");
  }

  const deps: AssuranceDependencies = {
    transferHbar,
    createTopic,
    submitMessage,
    now: () => new Date(),
    ...options.deps
  };
  const store = getCoordinationStore(options.store);

  try {
    const topic = await deps.createTopic(`ASSURANCE:${input.title}`, undefined, {
      client: options.client
    });

    const contract: AssuranceContract = {
      id: randomUUID(),
      title: input.title,
      description: input.description,
      organizerAccountId: input.organizerAccountId,
      escrowAccountId: input.escrowAccountId ?? input.organizerAccountId,
      thresholdHbar: input.thresholdHbar,
      pledgedHbar: 0,
      deadline: input.deadline,
      createdAt: deps.now().toISOString(),
      status: "OPEN",
      topicId: topic.topicId,
      topicUrl: topic.topicUrl
    };

    store.assuranceContracts.set(contract.id, contract);
    persistCoordinationStore(store);

    return contract;
  } catch (error) {
    throw toCoordinationError("Failed to create assurance contract.", error);
  }
}

export async function pledgeToAssurance(
  contractId: string,
  accountId: string,
  amountHbar: number,
  options: AssuranceOptions = {}
): Promise<AssurancePledge> {
  validateNonEmptyString(contractId, "contractId");
  validateNonEmptyString(accountId, "accountId");
  validatePositiveNumber(amountHbar, "amountHbar");

  const deps: AssuranceDependencies = {
    transferHbar,
    createTopic,
    submitMessage,
    now: () => new Date(),
    ...options.deps
  };

  const store = getCoordinationStore(options.store);
  const contract = store.assuranceContracts.get(contractId);

  if (!contract) {
    throw new CoordinationError(`Assurance contract ${contractId} was not found.`);
  }

  if (contract.status !== "OPEN") {
    throw new CoordinationError(`Assurance contract ${contractId} is not open for pledges.`);
  }

  if (Date.now() > Date.parse(contract.deadline)) {
    contract.status = "FAILED";
    persistCoordinationStore(store);
    throw new CoordinationError(`Assurance contract ${contractId} deadline has passed.`);
  }

  try {
    const transfer = await deps.transferHbar(accountId, contract.escrowAccountId, amountHbar, {
      client: options.client
    });

    const pledge: AssurancePledge = {
      id: randomUUID(),
      contractId,
      accountId,
      amountHbar,
      createdAt: deps.now().toISOString(),
      transactionId: transfer.transactionId,
      transactionUrl: transfer.transactionUrl
    };

    const pledges = store.assurancePledges.get(contractId) ?? [];
    pledges.push(pledge);
    store.assurancePledges.set(contractId, pledges);

    contract.pledgedHbar += amountHbar;

    if (contract.pledgedHbar >= contract.thresholdHbar) {
      contract.status = "TRIGGERED";
    }

    if (contract.topicId) {
      await deps.submitMessage(
        contract.topicId,
        {
          type: "ASSURANCE_PLEDGE",
          contractId,
          accountId,
          amountHbar,
          pledgedHbar: contract.pledgedHbar,
          thresholdHbar: contract.thresholdHbar,
          status: contract.status,
          createdAt: pledge.createdAt
        },
        {
          client: options.client
        }
      );
    }

    persistCoordinationStore(store);

    return pledge;
  } catch (error) {
    throw toCoordinationError(`Failed to pledge to assurance contract ${contractId}.`, error);
  }
}

export function evaluateAssuranceContract(
  contractId: string,
  store?: CoordinationStore
): AssuranceContract {
  const resolvedStore = getCoordinationStore(store);
  const contract = resolvedStore.assuranceContracts.get(contractId);

  if (!contract) {
    throw new CoordinationError(`Assurance contract ${contractId} was not found.`);
  }

  if (contract.status === "OPEN") {
    const now = Date.now();
    let changed = false;

    if (contract.pledgedHbar >= contract.thresholdHbar) {
      contract.status = "TRIGGERED";
      changed = true;
    } else if (now > Date.parse(contract.deadline)) {
      contract.status = "FAILED";
      changed = true;
    }

    if (changed) {
      persistCoordinationStore(resolvedStore);
    }
  }

  return contract;
}
