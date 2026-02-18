import { createApiServer } from "../server.js";
import { isExecutedDirectly, loadEnvFromDisk, logStep } from "./utils.js";

export async function runAutonomousRunner(port = 3001): Promise<void> {
  const envPath = loadEnvFromDisk();
  logStep(`Loaded environment from ${envPath}`);

  const server = createApiServer({
    autonomy: {
      enabled: true,
      strictMutations: true,
      tickMs: 12_000,
      agentCount: 3,
      initialAgentBalanceHbar: 25,
      challengeEveryTicks: 2,
      minOpenMarkets: 2,
      marketCloseMinutes: 20,
      minBetHbar: 1,
      maxBetHbar: 4
    }
  });

  const boundPort = await server.start(port);
  logStep(`Autonomous engine running on http://127.0.0.1:${boundPort}`);
  logStep("Endpoints: /autonomy/status, /markets, /agents, /ws");
  logStep("Strict mode: manual POST/PATCH/DELETE mutations are blocked outside /autonomy");

  await new Promise<void>((resolve, reject) => {
    const shutdown = async () => {
      try {
        await server.stop();
        resolve();
      } catch (error) {
        reject(error);
      }
    };

    process.once("SIGINT", () => {
      void shutdown();
    });
    process.once("SIGTERM", () => {
      void shutdown();
    });
  });
}

if (isExecutedDirectly(import.meta.url)) {
  const portArg = process.argv.find((arg) => arg.startsWith("--port="));
  const port = portArg ? Number(portArg.split("=")[1]) : 3001;

  runAutonomousRunner(port).catch((error) => {
    console.error("[infra] Autonomous runner failed:", error);
    process.exitCode = 1;
  });
}
