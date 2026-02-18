import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export function isPersistenceEnabled(): boolean {
  const flag = (process.env.SIMULACRUM_PERSIST_STATE ?? "true").toLowerCase();

  if (flag === "0" || flag === "false" || flag === "off") {
    return false;
  }

  return process.env.NODE_ENV !== "test";
}

export function stateDirectory(): string {
  return resolve(process.env.SIMULACRUM_STATE_DIR ?? resolve(process.cwd(), ".simulacrum-state"));
}

export function stateFilePath(fileName: string): string {
  return resolve(stateDirectory(), fileName);
}

export interface PersistentStoreOptions<TStore, TSerialized> {
  fileName: string;
  create: () => TStore;
  serialize: (store: TStore) => TSerialized;
  deserialize: (store: TStore, data: Partial<TSerialized>) => void;
}

export interface PersistentStore<TStore> {
  get: (override?: TStore) => TStore;
  persist: (override?: TStore) => void;
  reset: () => void;
}

export function createPersistentStore<TStore, TSerialized>(
  options: PersistentStoreOptions<TStore, TSerialized>
): PersistentStore<TStore> {
  const { fileName, create, serialize, deserialize } = options;

  function loadFromDisk(): TStore {
    const store = create();

    if (!isPersistenceEnabled()) {
      return store;
    }

    const filePath = stateFilePath(fileName);

    if (!existsSync(filePath)) {
      return store;
    }

    try {
      const raw = readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<TSerialized>;
      deserialize(store, parsed);
    } catch {
      return create();
    }

    return store;
  }

  function persistToDisk(store: TStore): void {
    if (!isPersistenceEnabled()) {
      return;
    }

    const dir = stateDirectory();
    const filePath = stateFilePath(fileName);
    const tempPath = `${filePath}.tmp`;

    mkdirSync(dir, { recursive: true });
    writeFileSync(tempPath, JSON.stringify(serialize(store), null, 2), "utf8");
    renameSync(tempPath, filePath);
  }

  function clearFromDisk(): void {
    if (!isPersistenceEnabled()) {
      return;
    }

    const filePath = stateFilePath(fileName);

    if (existsSync(filePath)) {
      rmSync(filePath, { force: true });
    }
  }

  let defaultStore = loadFromDisk();

  return {
    get(override?: TStore): TStore {
      return override ?? defaultStore;
    },
    persist(override?: TStore): void {
      persistToDisk(override ?? defaultStore);
    },
    reset(): void {
      defaultStore = create();
      clearFromDisk();
    }
  };
}
