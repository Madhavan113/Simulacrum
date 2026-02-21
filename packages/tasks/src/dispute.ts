import { submitMessage, validateNonEmptyString } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";

import { getTaskStore, persistTaskStore, type TaskStore } from "./store.js";
import { type DisputeWorkInput, type Task, TaskError } from "./types.js";

interface DisputeDependencies {
  submitMessage: typeof submitMessage;
  now: () => Date;
}

export interface DisputeOptions {
  client?: Client;
  store?: TaskStore;
  deps?: Partial<DisputeDependencies>;
}

function toTaskError(message: string, error: unknown): TaskError {
  if (error instanceof TaskError) return error;
  return new TaskError(message, error);
}

export async function disputeWork(
  input: DisputeWorkInput,
  options: DisputeOptions = {}
): Promise<Task> {
  validateNonEmptyString(input.taskId, "taskId");
  validateNonEmptyString(input.posterAccountId, "posterAccountId");
  validateNonEmptyString(input.reason, "reason");

  const deps: DisputeDependencies = {
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
    throw new TaskError("Only the poster can dispute work.");
  }

  if (task.status !== "REVIEW") {
    throw new TaskError(`Task is ${task.status}, can only dispute tasks in REVIEW.`);
  }

  try {
    const nowIso = deps.now().toISOString();
    task.status = "DISPUTED";
    task.updatedAt = nowIso;
    store.tasks.set(task.id, task);
    persistTaskStore(store);

    await deps.submitMessage(
      task.id,
      {
        type: "TASK_DISPUTED",
        taskId: task.id,
        posterAccountId: input.posterAccountId,
        reason: input.reason,
        disputedAt: nowIso
      },
      { client: options.client }
    );

    return task;
  } catch (error) {
    throw toTaskError("Failed to dispute work.", error);
  }
}
