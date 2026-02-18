import { createServer, type Server as HttpServer } from "node:http";

import express, { type Express } from "express";
import { WebSocketServer } from "ws";

import { BaseAgent, createRandomStrategy } from "@simulacrum/agents";

import {
  createAutonomyEngine,
  type AutonomyEngine,
  type AutonomyEngineOptions
} from "./autonomy/engine.js";
import {
  createClawdbotNetwork,
  type ClawdbotNetwork,
  type ClawdbotNetworkOptions
} from "./clawdbots/network.js";
import { createEventBus, type ApiEventBus } from "./events.js";
import { runMarketLifecycleSweep } from "./markets/lifecycle.js";
import { createAutonomyMutationGuard } from "./middleware/autonomy-guard.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { createAgentsRouter, type AgentRegistry } from "./routes/agents.js";
import { createAutonomyRouter } from "./routes/autonomy.js";
import { createClawdbotsRouter } from "./routes/clawdbots.js";
import { createInsuranceRouter } from "./routes/insurance.js";
import { createMarketsRouter } from "./routes/markets.js";
import { createReputationRouter } from "./routes/reputation.js";

class InMemoryAgentRegistry implements AgentRegistry {
  readonly #agents = new Map<string, BaseAgent>();

  all(): BaseAgent[] {
    return Array.from(this.#agents.values());
  }

  get(id: string): BaseAgent | undefined {
    return this.#agents.get(id);
  }

  add(agent: BaseAgent): void {
    this.#agents.set(agent.id, agent);
  }
}

export interface ApiServer {
  app: Express;
  eventBus: ApiEventBus;
  httpServer: HttpServer;
  autonomyEngine: AutonomyEngine | null;
  clawdbotNetwork: ClawdbotNetwork | null;
  start: (port?: number) => Promise<number>;
  stop: () => Promise<void>;
}

export interface ApiAutonomyOptions
  extends Pick<
    AutonomyEngineOptions,
    | "enabled"
    | "tickMs"
    | "agentCount"
    | "initialAgentBalanceHbar"
    | "challengeEveryTicks"
    | "minOpenMarkets"
    | "marketCloseMinutes"
    | "minBetHbar"
    | "maxBetHbar"
  > {
  strictMutations?: boolean;
}

export interface ApiClawdbotOptions
  extends Pick<
    ClawdbotNetworkOptions,
    | "enabled"
    | "tickMs"
    | "botCount"
    | "initialBotBalanceHbar"
    | "marketEveryTicks"
    | "minOpenMarkets"
    | "marketCloseMinutes"
    | "minBetHbar"
    | "maxBetHbar"
    | "threadRetention"
    | "oracleMinReputationScore"
    | "oracleMinVoters"
    | "hostedMode"
    | "minActionIntervalMs"
    | "maxActionsPerMinute"
    | "llm"
    | "credentialStoreSecret"
  > {}

export interface ApiMarketLifecycleOptions {
  enabled?: boolean;
  tickMs?: number;
  autoResolveAfterMs?: number;
  resolvedByAccountId?: string;
}

export interface CreateApiServerOptions {
  apiKey?: string;
  seedAgents?: boolean;
  autonomy?: ApiAutonomyOptions;
  clawdbots?: ApiClawdbotOptions;
  marketLifecycle?: ApiMarketLifecycleOptions;
}

export function createApiServer(options: CreateApiServerOptions = {}): ApiServer {
  const app = express();
  const eventBus = createEventBus();
  const registry = new InMemoryAgentRegistry();
  const autonomyOptions = options.autonomy ?? {};
  const { strictMutations, ...engineOptions } = autonomyOptions;
  const autonomyEngine = createAutonomyEngine({
    eventBus,
    registry,
    ...engineOptions
  });
  const clawdbotNetwork = createClawdbotNetwork({
    eventBus,
    registry,
    ...options.clawdbots
  });
  const lifecycleOptions = options.marketLifecycle ?? {};
  const lifecycleEnabled =
    lifecycleOptions.enabled ?? (process.env.MARKET_LIFECYCLE_ENABLED ?? "true").toLowerCase() !== "false";
  const envLifecycleTickMs = Number(process.env.MARKET_LIFECYCLE_TICK_MS);
  const fallbackLifecycleTickMs = Number.isFinite(envLifecycleTickMs) && envLifecycleTickMs > 0
    ? envLifecycleTickMs
    : 10_000;
  const lifecycleTickMs = Math.max(
    2_000,
    Math.round(lifecycleOptions.tickMs ?? fallbackLifecycleTickMs)
  );
  const envAutoResolveAfterMs = Number(process.env.MARKET_AUTO_RESOLVE_AFTER_MS);
  const fallbackAutoResolveAfterMs = Number.isFinite(envAutoResolveAfterMs) && envAutoResolveAfterMs >= 0
    ? envAutoResolveAfterMs
    : 0;
  const lifecycleAutoResolveAfterMs = Math.max(
    0,
    Math.round(lifecycleOptions.autoResolveAfterMs ?? fallbackAutoResolveAfterMs)
  );
  const lifecycleResolvedByAccountId =
    lifecycleOptions.resolvedByAccountId?.trim() ||
    process.env.MARKET_AUTO_RESOLVE_ACCOUNT_ID ||
    process.env.HEDERA_ACCOUNT_ID ||
    "SYSTEM_TIMER";
  let marketLifecycleInterval: ReturnType<typeof setInterval> | null = null;

  if (options.seedAgents) {
    registry.add(
      new BaseAgent(
        {
          id: "seed-random",
          name: "Seed Random Agent",
          accountId: "0.0.1111",
          bankrollHbar: 100,
          reputationScore: 55
        },
        createRandomStrategy({ random: () => 0.5 })
      )
    );
  }

  app.use(express.json());
  app.use(createAuthMiddleware({ apiKey: options.apiKey }));
  app.use(createAutonomyMutationGuard({ strictMutations }));

  app.get("/health", (_request, response) => {
    response.json({ ok: true, service: "@simulacrum/api" });
  });

  app.use("/markets", createMarketsRouter(eventBus));
  app.use("/agents", createAgentsRouter(registry, eventBus));
  app.use("/autonomy", createAutonomyRouter(autonomyEngine));
  app.use("/clawdbots", createClawdbotsRouter(clawdbotNetwork));
  app.use("/reputation", createReputationRouter(eventBus));
  app.use("/insurance", createInsuranceRouter(eventBus));

  const httpServer = createServer(app);
  const webSocketServer = new WebSocketServer({ server: httpServer, path: "/ws" });

  const unsubscribe = eventBus.subscribe((event) => {
    const data = JSON.stringify(event);

    for (const client of webSocketServer.clients) {
      if (client.readyState === client.OPEN) {
        client.send(data);
      }
    }
  });

  return {
    app,
    eventBus,
    httpServer,
    autonomyEngine,
    clawdbotNetwork,
    async start(port = 3001): Promise<number> {
      await new Promise<void>((resolve) => {
        httpServer.listen(port, () => resolve());
      });

      if (autonomyEngine) {
        await autonomyEngine.start();
      }
      if (clawdbotNetwork) {
        await clawdbotNetwork.start();
      }

      const shouldRunLifecycle =
        lifecycleEnabled && !autonomyEngine.getStatus().enabled && !clawdbotNetwork.getStatus().enabled;

      if (shouldRunLifecycle) {
        const sweep = async () => {
          await runMarketLifecycleSweep({
            eventBus,
            autoResolveAfterMs: lifecycleAutoResolveAfterMs,
            resolvedByAccountId: lifecycleResolvedByAccountId
          });
        };

        await sweep();
        marketLifecycleInterval = setInterval(() => {
          void sweep();
        }, lifecycleTickMs);
      }

      const address = httpServer.address();

      if (typeof address === "object" && address && typeof address.port === "number") {
        return address.port;
      }

      return port;
    },
    async stop(): Promise<void> {
      if (marketLifecycleInterval) {
        clearInterval(marketLifecycleInterval);
        marketLifecycleInterval = null;
      }

      if (clawdbotNetwork) {
        await clawdbotNetwork.stop();
      }
      if (autonomyEngine) {
        await autonomyEngine.stop();
      }

      unsubscribe();
      await new Promise<void>((resolve, reject) => {
        webSocketServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}
