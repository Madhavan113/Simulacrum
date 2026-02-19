import { createApiServer } from "../server.js";
import { isExecutedDirectly, loadEnvFromDisk, logStep } from "./utils.js";

export async function runProductionServer(): Promise<void> {
  // On Railway/cloud, env vars are injected — no .env file exists.
  try {
    const envPath = loadEnvFromDisk();
    logStep(`Loaded environment from ${envPath}`);
  } catch {
    logStep("No .env file found — using environment variables from host.");
  }

  // Railway injects PORT; fall back to 3001 for local runs.
  const port = Number(process.env.PORT ?? 3001);

  const clawdbotsEnabled = process.env.CLAWDBOTS_ENABLED !== "false";

  const server = createApiServer({
    clawdbots: {
      enabled: clawdbotsEnabled,
      botCount: Number(process.env.CLAWDBOT_COUNT ?? 3),
      initialBotBalanceHbar: Number(process.env.CLAWDBOT_BALANCE_HBAR ?? 20),
      tickMs: Number(process.env.CLAWDBOT_TICK_MS ?? 30_000),
      marketCloseMinutes: Number(process.env.CLAWDBOT_MARKET_CLOSE_MINUTES ?? 15),
    },
    autonomy: { enabled: false },
    agentPlatform: {
      enabled: true,
      agentOnlyMode: false,
      selfRegistrationEnabled: true,
      legacyRoutesEnabled: true,
    },
    cors: { allowedOrigins: "*" },
  });

  const boundPort = await server.start(port);
  logStep(`Simulacrum production server running on port ${boundPort}`);
  logStep("Agent platform: /agent/v1/auth/register | /agent/v1/markets | /agent/v1/wallet");
  logStep(`ClawDBots: ${clawdbotsEnabled ? "ENABLED" : "disabled"}`);
  logStep("Public reads:   /markets | /agents | /reputation | /health | /ws");

  await new Promise<void>((resolve, reject) => {
    process.once("SIGINT", async () => { try { await server.stop(); resolve(); } catch (e) { reject(e); } });
    process.once("SIGTERM", async () => { try { await server.stop(); resolve(); } catch (e) { reject(e); } });
  });
}

if (isExecutedDirectly(import.meta.url)) {
  runProductionServer().catch((error) => {
    console.error("[production] Server failed:", error);
    process.exitCode = 1;
  });
}
