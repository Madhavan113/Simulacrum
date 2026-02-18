import { createApiServer } from "../server.js";
import { resetAllBackendState } from "./reset-state.js";
import {
  isExecutedDirectly,
  loadEnvFromDisk,
  logStep,
  readPrimaryCredentials,
  requestJson,
  setSigner
} from "./utils.js";

interface SeedSummary {
  operatorAccountId: string;
  marketId: string;
  agentIds: string[];
}

async function seedViaApi(baseUrl: string, operatorAccountId: string): Promise<SeedSummary> {
  logStep("Seeding agents");
  const agent1 = await requestJson<{ agent: { id: string } }>("POST", `${baseUrl}/agents`, {
    name: "Alpha",
    accountId: operatorAccountId,
    bankrollHbar: 100,
    strategy: "random"
  }, 201);
  const agent2 = await requestJson<{ agent: { id: string } }>("POST", `${baseUrl}/agents`, {
    name: "Beta",
    accountId: operatorAccountId,
    bankrollHbar: 100,
    strategy: "contrarian"
  }, 201);

  logStep("Seeding demo market");
  const created = await requestJson<{ market: { id: string } }>("POST", `${baseUrl}/markets`, {
    question: "Will Simulacrum demo execute successfully?",
    description: "Seeded market for hackathon demos",
    creatorAccountId: operatorAccountId,
    escrowAccountId: operatorAccountId,
    closeTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    outcomes: ["YES", "NO"]
  }, 201);

  return {
    operatorAccountId,
    marketId: created.market.id,
    agentIds: [agent1.agent.id, agent2.agent.id]
  };
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
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    return await seedViaApi(baseUrl, operatorAccountId);
  } finally {
    await server.stop();
  }
}

export async function seedAndServeDemoData(port = 3001): Promise<void> {
  const { operatorAccountId } = bootstrapSigner();
  const server = createApiServer();
  const boundPort = await server.start(port);
  const baseUrl = `http://127.0.0.1:${boundPort}`;
  const summary = await seedViaApi(baseUrl, operatorAccountId);

  logStep("Seed complete; server is running");
  console.log(JSON.stringify({ baseUrl, ...summary }, null, 2));

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
        logStep("Seed complete");
        console.log(JSON.stringify(summaryOrVoid, null, 2));
      }
    })
    .catch((error) => {
      console.error("[infra] Seed failed:", error);
      process.exitCode = 1;
    });
}
