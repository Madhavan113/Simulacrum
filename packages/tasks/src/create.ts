import { createTopic, submitMessage, transferHbar, validateNonEmptyString, validatePositiveNumber } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";

import { getTaskStore, persistTaskStore, type TaskStore } from "./store.js";
import { type CancelTaskInput, type CreateTaskInput, type Task, TaskError } from "./types.js";

interface CreateTaskDependencies {
  createTopic: typeof createTopic;
  submitMessage: typeof submitMessage;
  transferHbar: typeof transferHbar;
  now: () => Date;
}

export interface CreateTaskOptions {
  client?: Client;
  store?: TaskStore;
  deps?: Partial<CreateTaskDependencies>;
}

export interface CreateTaskResult {
  task: Task;
  topicTransactionId: string;
  topicTransactionUrl: string;
}

function toTaskError(message: string, error: unknown): TaskError {
  if (error instanceof TaskError) return error;
  return new TaskError(message, error);
}

function assertDeadline(deadline: string, now: Date): void {
  const timestamp = Date.parse(deadline);

  if (!Number.isFinite(timestamp)) {
    throw new TaskError("deadline must be a valid ISO timestamp.");
  }

  if (timestamp <= now.getTime()) {
    throw new TaskError("deadline must be in the future.");
  }
}

export async function createTask(
  input: CreateTaskInput,
  options: CreateTaskOptions = {}
): Promise<CreateTaskResult> {
  validateNonEmptyString(input.posterAccountId, "posterAccountId");
  validateNonEmptyString(input.title, "title");
  validateNonEmptyString(input.description, "description");
  validateNonEmptyString(input.category, "category");
  validatePositiveNumber(input.bountyHbar, "bountyHbar");

  const deps: CreateTaskDependencies = {
    createTopic,
    submitMessage,
    transferHbar,
    now: () => new Date(),
    ...options.deps
  };

  assertDeadline(input.deadline, deps.now());

  const store = getTaskStore(options.store);

  try {
    const topic = await deps.createTopic(`TASK:${input.title}`, undefined, {
      client: options.client
    });

    const nowIso = deps.now().toISOString();
    const task: Task = {
      id: topic.topicId,
      posterAccountId: input.posterAccountId,
      title: input.title,
      description: input.description,
      category: input.category,
      bountyHbar: input.bountyHbar,
      deadline: input.deadline,
      status: "OPEN",
      requiredReputation: input.requiredReputation ?? 0,
      maxBids: input.maxBids ?? 10,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    store.tasks.set(task.id, task);
    persistTaskStore(store);

    await deps.submitMessage(
      topic.topicId,
      {
        type: "TASK_CREATED",
        taskId: task.id,
        title: task.title,
        category: task.category,
        bountyHbar: task.bountyHbar,
        deadline: task.deadline,
        posterAccountId: task.posterAccountId,
        createdAt: task.createdAt
      },
      { client: options.client }
    );

    return {
      task,
      topicTransactionId: topic.transactionId,
      topicTransactionUrl: topic.transactionUrl
    };
  } catch (error) {
    throw toTaskError("Failed to create task.", error);
  }
}

export async function cancelTask(
  input: CancelTaskInput,
  options: CreateTaskOptions = {}
): Promise<Task> {
  validateNonEmptyString(input.taskId, "taskId");
  validateNonEmptyString(input.posterAccountId, "posterAccountId");

  const deps: CreateTaskDependencies = {
    createTopic,
    submitMessage,
    transferHbar,
    now: () => new Date(),
    ...options.deps
  };

  const store = getTaskStore(options.store);
  const task = store.tasks.get(input.taskId);

  if (!task) {
    throw new TaskError(`Task ${input.taskId} not found.`);
  }

  if (task.posterAccountId !== input.posterAccountId) {
    throw new TaskError("Only the poster can cancel a task.");
  }

  if (task.status !== "OPEN") {
    throw new TaskError(`Task is ${task.status}, can only cancel OPEN tasks.`);
  }

  try {
    const nowIso = deps.now().toISOString();
    task.status = "CANCELLED";
    task.updatedAt = nowIso;
    store.tasks.set(task.id, task);
    persistTaskStore(store);

    await deps.submitMessage(
      task.id,
      {
        type: "TASK_CANCELLED",
        taskId: task.id,
        posterAccountId: input.posterAccountId,
        cancelledAt: nowIso
      },
      { client: options.client }
    );

    return task;
  } catch (error) {
    throw toTaskError("Failed to cancel task.", error);
  }
}
