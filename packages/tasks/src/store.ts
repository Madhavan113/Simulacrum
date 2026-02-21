import { createPersistentStore } from "@simulacrum/core";

import type { Task, TaskBid, TaskSubmission } from "./types.js";

export interface TaskStore {
  tasks: Map<string, Task>;
  bids: Map<string, TaskBid[]>;
  submissions: Map<string, TaskSubmission[]>;
}

interface PersistedTaskStore {
  tasks: Array<[string, Task]>;
  bids: Array<[string, TaskBid[]]>;
  submissions: Array<[string, TaskSubmission[]]>;
}

export function createTaskStore(): TaskStore {
  return {
    tasks: new Map<string, Task>(),
    bids: new Map<string, TaskBid[]>(),
    submissions: new Map<string, TaskSubmission[]>()
  };
}

const persistence = createPersistentStore<TaskStore, PersistedTaskStore>({
  fileName: "tasks.json",
  create: createTaskStore,
  serialize(store) {
    return {
      tasks: Array.from(store.tasks.entries()),
      bids: Array.from(store.bids.entries()),
      submissions: Array.from(store.submissions.entries())
    };
  },
  deserialize(store, data) {
    for (const [key, value] of data.tasks ?? []) {
      store.tasks.set(key, value);
    }
    for (const [key, value] of data.bids ?? []) {
      store.bids.set(key, value);
    }
    for (const [key, value] of data.submissions ?? []) {
      store.submissions.set(key, value);
    }
  }
});

export function getTaskStore(store?: TaskStore): TaskStore {
  return persistence.get(store);
}

export function persistTaskStore(store?: TaskStore): void {
  persistence.persist(store);
}

export function resetTaskStoreForTests(): void {
  persistence.reset();
}
