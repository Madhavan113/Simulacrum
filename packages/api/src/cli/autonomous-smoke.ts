import { createApiServer } from "../server.js";
import { isExecutedDirectly, loadEnvFromDisk, logStep, requestJson } from "./utils.js";

interface AutonomyStatus {
  enabled: boolean;
  running: boolean;
  tickMs: number;
  tickCount: number;
  agentCount: number;
  managedAgentCount: number;
  openMarkets: number;
  lastTickAt?: string;
  lastError?: string;
}

interface AutonomousSmokeResult {
  managedAgentCount: number;
  totalAgents: number;
  openMarkets: number;
  createdChallengeMarketId: string;
  blockedMutationError: string;
  tickCount: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function createChallengeMarketWithRetries(
  baseUrl: string,
  candidateAgentIds: readonly string[]
): Promise<string> {
  const attempts = [...candidateAgentIds, ""];
  let lastError = "unknown error";

  for (const challengerAgentId of attempts) {
    try {
      const payload: Record<string, unknown> = {
        question: "Will autonomous smoke challenge be accepted?",
        outcomes: ["YES", "NO"],
        closeMinutes: 5
      };

      if (challengerAgentId) {
        payload.challengerAgentId = challengerAgentId;
      }

      const challenge = await requestJson<{ marketId: string }>(
        "POST",
        `${baseUrl}/autonomy/challenges`,
        payload,
        201
      );

      return challenge.marketId;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(`Unable to create autonomous challenge market. Last error: ${lastError}`);
}

async function waitForAutonomyReady(
  baseUrl: string,
  expectedAgentCount: number,
  timeoutMs = 75_000
): Promise<AutonomyStatus> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const status = await requestJson<AutonomyStatus>("GET", `${baseUrl}/autonomy/status`, undefined, 200);

    if (
      status.running &&
      status.managedAgentCount >= expectedAgentCount &&
      status.openMarkets >= 1 &&
      !status.lastError
    ) {
      return status;
    }

    await sleep(2_500);
  }

  throw new Error(`Autonomy engine did not become ready within ${timeoutMs}ms.`);
}

export async function runAutonomousSmoke(): Promise<AutonomousSmokeResult> {
  const envPath = loadEnvFromDisk();
  logStep(`Loaded environment from ${envPath}`);

  const targetAgentCount = 3;
  const server = createApiServer({
    autonomy: {
      enabled: true,
      strictMutations: true,
      tickMs: 6_000,
      agentCount: targetAgentCount,
      initialAgentBalanceHbar: 100,
      challengeEveryTicks: 1,
      minOpenMarkets: 1,
      marketCloseMinutes: 20,
      minBetHbar: 1,
      maxBetHbar: 3
    }
  });

  const port = await server.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    logStep("Waiting for autonomous engine bootstrap");
    await waitForAutonomyReady(baseUrl, targetAgentCount);

    logStep("Verifying autonomous reads");
    const agents = await requestJson<{ agents: Array<{ id: string }> }>(
      "GET",
      `${baseUrl}/agents`,
      undefined,
      200
    );
    const markets = await requestJson<{ markets: Array<{ id: string }> }>(
      "GET",
      `${baseUrl}/markets`,
      undefined,
      200
    );

    if (agents.agents.length < targetAgentCount) {
      throw new Error(
        `Expected at least ${targetAgentCount} agents, got ${agents.agents.length}.`
      );
    }

    if (markets.markets.length < 1) {
      throw new Error("Expected at least one market created by autonomous runner.");
    }

    logStep("Verifying strict mode blocks manual writes");
    const blockedMutation = await requestJson<{ error?: string }>(
      "POST",
      `${baseUrl}/markets`,
      {
        question: "This should fail in strict autonomous mode",
        creatorAccountId: "0.0.1",
        closeTime: new Date(Date.now() + 3600_000).toISOString()
      },
      403
    );

    const blockedMutationError = blockedMutation.error ?? "missing error response";

    if (!/Strict autonomous mode/i.test(blockedMutationError)) {
      throw new Error(`Unexpected strict mode message: ${blockedMutationError}`);
    }

    logStep("Submitting custom autonomous challenge");
    const challengeMarketId = await createChallengeMarketWithRetries(
      baseUrl,
      agents.agents.map((agent) => agent.id)
    );

    await requestJson("POST", `${baseUrl}/autonomy/run-now`, undefined, 200);
    const status = await requestJson<AutonomyStatus>("GET", `${baseUrl}/autonomy/status`, undefined, 200);

    return {
      managedAgentCount: status.managedAgentCount,
      totalAgents: status.agentCount,
      openMarkets: status.openMarkets,
      createdChallengeMarketId: challengeMarketId,
      blockedMutationError,
      tickCount: status.tickCount
    };
  } finally {
    await server.stop();
  }
}

if (isExecutedDirectly(import.meta.url)) {
  runAutonomousSmoke()
    .then((result) => {
      logStep("Autonomous smoke completed successfully");
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error("[infra] Autonomous smoke failed:", error);
      process.exitCode = 1;
    });
}
