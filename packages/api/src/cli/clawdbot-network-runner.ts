import { createApiServer } from "../server.js";
import { isExecutedDirectly, loadEnvFromDisk, logStep } from "./utils.js";

export async function runClawdbotNetwork(port = 3001): Promise<void> {
  // On Railway/cloud, env vars are injected directly — no .env file exists.
  // Fall back gracefully so the server still starts.
  try {
    const envPath = loadEnvFromDisk();
    logStep(`Loaded environment from ${envPath}`);
  } catch {
    logStep("No .env file found — using environment variables from host.");
  }

  const server = createApiServer({
    autonomy: {
      strictMutations: true
    },
    agentPlatform: {
      enabled: true,
      selfRegistrationEnabled: true
    },
    clawdbots: {
      enabled: true,
      tickMs: 10_000,
      botCount: 4,
      initialBotBalanceHbar: 30,
      marketEveryTicks: 2,
      minOpenMarkets: 2,
      marketCloseMinutes: 15,
      minBetHbar: 1,
      maxBetHbar: 4,
      threadRetention: 600,
      oracleMinReputationScore: 65,
      oracleMinVoters: 2,
      hostedMode: true,
      minActionIntervalMs: 2_000,
      maxActionsPerMinute: 10
    }
  });

  const boundPort = await server.start(port);
  logStep(`ClawDBot network running on http://127.0.0.1:${boundPort}`);
  logStep("Endpoints: /clawdbots/status, /clawdbots/thread, /clawdbots/markets, /markets, /ws");
  logStep("Hosted control plane endpoints enabled by CLAWDBOT_HOSTED_CONTROL_ENABLED (default true)");
  logStep("Challenge flow endpoints enabled by MARKET_CHALLENGE_FLOW_ENABLED (default true)");
  logStep("Strict mode: manual POST/PATCH/DELETE mutations are blocked outside /autonomy and /clawdbots");

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

  runClawdbotNetwork(port).catch((error) => {
    console.error("[infra] ClawDBot network runner failed:", error);
    process.exitCode = 1;
  });
}
