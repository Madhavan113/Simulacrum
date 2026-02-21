/**
 * Legacy seed-demo entry point.
 *
 * All agent creation, market seeding, service registration, and task posting
 * are now handled organically by the ClawDBot persona network
 * (see clawdbot-network-runner.ts). This file is kept only so that existing
 * npm scripts (`infra:seed`, `infra:demo`) don't break — it boots a bare
 * server with no pre-seeded state.
 */

import { createApiServer } from "../server.js";
import {
  isExecutedDirectly,
  loadEnvFromDisk,
  logStep,
  readPrimaryCredentials,
  setSigner
} from "./utils.js";
import { resetAllBackendState } from "./reset-state.js";

interface SeedSummary {
  operatorAccountId: string;
}

function bootstrapSigner(): { envPath: string; operatorAccountId: string } {
  const envPath = loadEnvFromDisk();
  const credentials = readPrimaryCredentials();

  logStep(`Loaded environment from ${envPath}`);
  setSigner(
    credentials.accountId,
    credentials.privateKey,
    credentials.network,
    credentials.privateKeyType
  );

  resetAllBackendState();

  return {
    envPath,
    operatorAccountId: credentials.accountId
  };
}

export async function seedDemoData(): Promise<SeedSummary> {
  const { operatorAccountId } = bootstrapSigner();

  const server = createApiServer();
  const port = await server.start(0);
  logStep(`Bare server started on port ${port} — no seed data (agents bootstrap themselves).`);

  await server.stop();
  return { operatorAccountId };
}

export async function seedAndServeDemoData(port = 3001): Promise<void> {
  const { operatorAccountId } = bootstrapSigner();
  const server = createApiServer();
  const boundPort = await server.start(port);

  logStep(`Server running on http://127.0.0.1:${boundPort} — no seed data.`);
  logStep("Run 'pnpm infra:clawdbots' instead for the full persona network.");
  console.log(JSON.stringify({ baseUrl: `http://127.0.0.1:${boundPort}`, operatorAccountId }, null, 2));

  await new Promise<void>((resolve, reject) => {
    const stop = async () => {
      try {
        await server.stop();
        resolve();
      } catch (error) {
        reject(error);
      }
    };

    process.once("SIGINT", () => {
      void stop();
    });
    process.once("SIGTERM", () => {
      void stop();
    });
  });
}

if (isExecutedDirectly(import.meta.url)) {
  const keepRunning = process.argv.includes("--keep-running");
  const portArg = process.argv.find((arg) => arg.startsWith("--port="));
  const port = portArg ? Number(portArg.split("=")[1]) : 3001;

  const runner = keepRunning ? seedAndServeDemoData(port) : seedDemoData();

  Promise.resolve(runner)
    .then((summaryOrVoid) => {
      if (summaryOrVoid) {
        logStep("Done (no seed data — agents are self-bootstrapping).");
        console.log(JSON.stringify(summaryOrVoid, null, 2));
      }
    })
    .catch((error) => {
      console.error("[infra] Seed failed:", error);
      process.exitCode = 1;
    });
}
