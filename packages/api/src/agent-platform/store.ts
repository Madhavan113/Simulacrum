import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { AgentPlatformStore } from "./types.js";

export function createAgentPlatformStore(): AgentPlatformStore {
  return {
    agents: {},
    wallets: {},
    challenges: {},
    faucet: {
      totalDispensedHbar: 0,
      byDate: {},
      byAgentId: {}
    }
  };
}

function isPersistenceEnabled(): boolean {
  const flag = (process.env.SIMULACRUM_PERSIST_STATE ?? "true").toLowerCase();

  if (flag === "0" || flag === "false" || flag === "off") {
    return false;
  }

  return process.env.NODE_ENV !== "test";
}

function stateDirectory(): string {
  return resolve(process.env.SIMULACRUM_STATE_DIR ?? resolve(process.cwd(), ".simulacrum-state"));
}

function stateFilePath(): string {
  return resolve(stateDirectory(), "agent-platform.json");
}

function loadStoreFromDisk(): AgentPlatformStore {
  const empty = createAgentPlatformStore();

  if (!isPersistenceEnabled()) {
    return empty;
  }

  const filePath = stateFilePath();

  if (!existsSync(filePath)) {
    return empty;
  }

  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<AgentPlatformStore>;

    return {
      agents: parsed.agents ?? {},
      wallets: parsed.wallets ?? {},
      challenges: parsed.challenges ?? {},
      faucet: {
        totalDispensedHbar: parsed.faucet?.totalDispensedHbar ?? 0,
        byDate: parsed.faucet?.byDate ?? {},
        byAgentId: parsed.faucet?.byAgentId ?? {}
      }
    };
  } catch {
    return empty;
  }
}

function persistStoreToDisk(store: AgentPlatformStore): void {
  if (!isPersistenceEnabled()) {
    return;
  }

  const dir = stateDirectory();
  const filePath = stateFilePath();
  const tempPath = `${filePath}.tmp`;

  mkdirSync(dir, { recursive: true });
  writeFileSync(tempPath, JSON.stringify(store, null, 2), "utf8");
  renameSync(tempPath, filePath);
}

function clearStoreFromDisk(): void {
  if (!isPersistenceEnabled()) {
    return;
  }

  const filePath = stateFilePath();

  if (existsSync(filePath)) {
    rmSync(filePath, { force: true });
  }
}

let defaultStore = loadStoreFromDisk();

export function getAgentPlatformStore(store?: AgentPlatformStore): AgentPlatformStore {
  return store ?? defaultStore;
}

export function persistAgentPlatformStore(store?: AgentPlatformStore): void {
  persistStoreToDisk(getAgentPlatformStore(store));
}

export function resetAgentPlatformStoreForTests(): void {
  defaultStore = createAgentPlatformStore();
  clearStoreFromDisk();
}
