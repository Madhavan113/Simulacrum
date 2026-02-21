import { getTaskStore, persistTaskStore, type TaskStore } from "./store.js";
import type { Task } from "./types.js";

export interface ExpireTasksOptions {
  store?: TaskStore;
  now?: Date;
}

export function expireTasks(options: ExpireTasksOptions = {}): Task[] {
  const now = options.now ?? new Date();
  const store = getTaskStore(options.store);
  const expired: Task[] = [];

  for (const task of store.tasks.values()) {
    if (task.status !== "OPEN") continue;

    const deadline = Date.parse(task.deadline);
    if (Number.isFinite(deadline) && deadline <= now.getTime()) {
      task.status = "EXPIRED";
      task.updatedAt = now.toISOString();
      store.tasks.set(task.id, task);
      expired.push(task);
    }
  }

  if (expired.length > 0) {
    persistTaskStore(store);
  }

  return expired;
}
