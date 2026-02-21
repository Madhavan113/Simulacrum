import { submitMessage, validateNonEmptyString, validatePositiveNumber } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";
import crypto from "node:crypto";

import { getTaskStore, persistTaskStore, type TaskStore } from "./store.js";
import { type AcceptBidInput, type BidOnTaskInput, type TaskBid, TaskError } from "./types.js";

interface BidDependencies {
  submitMessage: typeof submitMessage;
  now: () => Date;
}

export interface BidOptions {
  client?: Client;
  store?: TaskStore;
  deps?: Partial<BidDependencies>;
  reputationLookup?: (accountId: string) => number;
}

function toTaskError(message: string, error: unknown): TaskError {
  if (error instanceof TaskError) return error;
  return new TaskError(message, error);
}

export async function bidOnTask(
  input: BidOnTaskInput,
  options: BidOptions = {}
): Promise<TaskBid> {
  validateNonEmptyString(input.taskId, "taskId");
  validateNonEmptyString(input.bidderAccountId, "bidderAccountId");
  validatePositiveNumber(input.proposedPriceHbar, "proposedPriceHbar");
  validateNonEmptyString(input.estimatedCompletion, "estimatedCompletion");
  validateNonEmptyString(input.proposal, "proposal");

  const deps: BidDependencies = {
    submitMessage,
    now: () => new Date(),
    ...options.deps
  };

  const store = getTaskStore(options.store);
  const task = store.tasks.get(input.taskId);

  if (!task) {
    throw new TaskError(`Task ${input.taskId} not found.`);
  }

  if (task.status !== "OPEN") {
    throw new TaskError(`Task is ${task.status}, can only bid on OPEN tasks.`);
  }

  if (task.posterAccountId === input.bidderAccountId) {
    throw new TaskError("Cannot bid on your own task.");
  }

  // Check reputation requirement
  if (task.requiredReputation > 0 && options.reputationLookup) {
    const bidderRep = options.reputationLookup(input.bidderAccountId);
    if (bidderRep < task.requiredReputation) {
      throw new TaskError(
        `Requires reputation >= ${task.requiredReputation}, bidder has ${bidderRep}.`
      );
    }
  }

  const existingBids = store.bids.get(input.taskId) ?? [];

  // Check max bids
  const activeBids = existingBids.filter((b) => b.status === "PENDING");
  if (activeBids.length >= task.maxBids) {
    throw new TaskError(`Task has reached maximum bids (${task.maxBids}).`);
  }

  // Check duplicate bid
  const alreadyBid = existingBids.some(
    (b) => b.bidderAccountId === input.bidderAccountId && b.status === "PENDING"
  );
  if (alreadyBid) {
    throw new TaskError("You already have a pending bid on this task.");
  }

  try {
    const nowIso = deps.now().toISOString();
    const bid: TaskBid = {
      id: crypto.randomUUID(),
      taskId: input.taskId,
      bidderAccountId: input.bidderAccountId,
      proposedPriceHbar: input.proposedPriceHbar,
      estimatedCompletion: input.estimatedCompletion,
      proposal: input.proposal,
      status: "PENDING",
      createdAt: nowIso
    };

    existingBids.push(bid);
    store.bids.set(input.taskId, existingBids);
    persistTaskStore(store);

    await deps.submitMessage(
      task.id,
      {
        type: "TASK_BID",
        bidId: bid.id,
        taskId: task.id,
        bidderAccountId: input.bidderAccountId,
        proposedPriceHbar: input.proposedPriceHbar,
        createdAt: nowIso
      },
      { client: options.client }
    );

    return bid;
  } catch (error) {
    throw toTaskError("Failed to bid on task.", error);
  }
}

export async function acceptBid(
  input: AcceptBidInput,
  options: BidOptions = {}
): Promise<{ task: import("./types.js").Task; bid: TaskBid }> {
  validateNonEmptyString(input.taskId, "taskId");
  validateNonEmptyString(input.bidId, "bidId");
  validateNonEmptyString(input.posterAccountId, "posterAccountId");

  const deps: BidDependencies = {
    submitMessage,
    now: () => new Date(),
    ...options.deps
  };

  const store = getTaskStore(options.store);
  const task = store.tasks.get(input.taskId);

  if (!task) {
    throw new TaskError(`Task ${input.taskId} not found.`);
  }

  if (task.posterAccountId !== input.posterAccountId) {
    throw new TaskError("Only the poster can accept bids.");
  }

  if (task.status !== "OPEN") {
    throw new TaskError(`Task is ${task.status}, can only accept bids on OPEN tasks.`);
  }

  const bids = store.bids.get(input.taskId) ?? [];
  const bid = bids.find((b) => b.id === input.bidId);

  if (!bid) {
    throw new TaskError(`Bid ${input.bidId} not found.`);
  }

  if (bid.status !== "PENDING") {
    throw new TaskError(`Bid is ${bid.status}, cannot accept.`);
  }

  try {
    const nowIso = deps.now().toISOString();

    // Accept the winning bid
    bid.status = "ACCEPTED";

    // Reject all other pending bids
    for (const other of bids) {
      if (other.id !== bid.id && other.status === "PENDING") {
        other.status = "REJECTED";
      }
    }

    store.bids.set(input.taskId, bids);

    // Update task
    task.status = "ASSIGNED";
    task.assigneeAccountId = bid.bidderAccountId;
    task.acceptedBidId = bid.id;
    task.updatedAt = nowIso;
    store.tasks.set(task.id, task);

    persistTaskStore(store);

    await deps.submitMessage(
      task.id,
      {
        type: "TASK_ASSIGNED",
        taskId: task.id,
        bidId: bid.id,
        assigneeAccountId: bid.bidderAccountId,
        assignedAt: nowIso
      },
      { client: options.client }
    );

    return { task, bid };
  } catch (error) {
    throw toTaskError("Failed to accept bid.", error);
  }
}
