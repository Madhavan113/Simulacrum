import { submitMessage, transferHbar, validateNonEmptyString } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";
import crypto from "node:crypto";

import { getTaskStore, persistTaskStore, type TaskStore } from "./store.js";
import {
  type ApproveWorkInput,
  type SubmitWorkInput,
  type Task,
  type TaskSubmission,
  TaskError
} from "./types.js";

interface SubmitDependencies {
  submitMessage: typeof submitMessage;
  transferHbar: typeof transferHbar;
  now: () => Date;
}

export interface SubmitOptions {
  client?: Client;
  store?: TaskStore;
  deps?: Partial<SubmitDependencies>;
}

function toTaskError(message: string, error: unknown): TaskError {
  if (error instanceof TaskError) return error;
  return new TaskError(message, error);
}

export async function submitWork(
  input: SubmitWorkInput,
  options: SubmitOptions = {}
): Promise<TaskSubmission> {
  validateNonEmptyString(input.taskId, "taskId");
  validateNonEmptyString(input.submitterAccountId, "submitterAccountId");
  validateNonEmptyString(input.deliverable, "deliverable");

  const deps: SubmitDependencies = {
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

  if (task.assigneeAccountId !== input.submitterAccountId) {
    throw new TaskError("Only the assigned agent can submit work.");
  }

  if (task.status !== "ASSIGNED" && task.status !== "IN_PROGRESS") {
    throw new TaskError(`Task is ${task.status}, cannot submit work.`);
  }

  try {
    const nowIso = deps.now().toISOString();
    const submission: TaskSubmission = {
      id: crypto.randomUUID(),
      taskId: input.taskId,
      bidId: task.acceptedBidId!,
      submitterAccountId: input.submitterAccountId,
      deliverable: input.deliverable,
      submittedAt: nowIso
    };

    const existing = store.submissions.get(input.taskId) ?? [];
    existing.push(submission);
    store.submissions.set(input.taskId, existing);

    task.status = "REVIEW";
    task.updatedAt = nowIso;
    store.tasks.set(task.id, task);

    persistTaskStore(store);

    await deps.submitMessage(
      task.id,
      {
        type: "TASK_SUBMITTED",
        submissionId: submission.id,
        taskId: task.id,
        submitterAccountId: input.submitterAccountId,
        submittedAt: nowIso
      },
      { client: options.client }
    );

    return submission;
  } catch (error) {
    throw toTaskError("Failed to submit work.", error);
  }
}

export async function approveWork(
  input: ApproveWorkInput,
  options: SubmitOptions = {}
): Promise<Task> {
  validateNonEmptyString(input.taskId, "taskId");
  validateNonEmptyString(input.posterAccountId, "posterAccountId");

  const deps: SubmitDependencies = {
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
    throw new TaskError("Only the poster can approve work.");
  }

  if (task.status !== "REVIEW") {
    throw new TaskError(`Task is ${task.status}, can only approve tasks in REVIEW.`);
  }

  try {
    // Pay the assignee
    await deps.transferHbar(task.posterAccountId, task.assigneeAccountId!, task.bountyHbar, {
      client: options.client
    });

    const nowIso = deps.now().toISOString();
    task.status = "COMPLETED";
    task.updatedAt = nowIso;
    store.tasks.set(task.id, task);
    persistTaskStore(store);

    await deps.submitMessage(
      task.id,
      {
        type: "TASK_COMPLETED",
        taskId: task.id,
        assigneeAccountId: task.assigneeAccountId,
        bountyHbar: task.bountyHbar,
        completedAt: nowIso
      },
      { client: options.client }
    );

    return task;
  } catch (error) {
    throw toTaskError("Failed to approve work.", error);
  }
}
