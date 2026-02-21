import { readFileSync } from "node:fs";
import { createServer, type Server as HttpServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import express, { type Express } from "express";
import { WebSocketServer } from "ws";

import { BaseAgent, createRandomStrategy } from "@simulacrum/agents";

import {
  createAgentAuthService,
  type AgentAuthService
} from "./agent-platform/auth.js";
import {
  createAgentFaucetService,
  type AgentFaucetService
} from "./agent-platform/faucet.js";
import type { AgentPlatformOptions } from "./agent-platform/types.js";
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
import { runFundingSettlementSweep } from "./derivatives/settlement.js";
import { runOptionsSweep } from "./derivatives/options-sweep.js";
import { createEventBus, type ApiEventBus } from "./events.js";
import { createAgentOnlyModeGuard } from "./middleware/agent-auth.js";
import { runMarketLifecycleSweep } from "./markets/lifecycle.js";
import { createAutonomyMutationGuard } from "./middleware/autonomy-guard.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { createCorsMiddleware } from "./middleware/cors.js";
import { createRateLimitMiddleware } from "./middleware/rate-limit.js";
import { createAgentsRouter, type AgentRegistry } from "./routes/agents.js";
import { createAgentV1Router } from "./routes/agent-v1.js";
import { createAutonomyRouter } from "./routes/autonomy.js";
import { createClawdbotsRouter } from "./routes/clawdbots.js";
import { createDerivativesRouter } from "./routes/derivatives.js";
import { createInsuranceRouter } from "./routes/insurance.js";
import { createMarketsRouter } from "./routes/markets.js";
import { createReputationRouter } from "./routes/reputation.js";
import { createResearchRouter } from "./routes/research.js";
import { createServicesRouter } from "./routes/services.js";
import { createTasksRouter } from "./routes/tasks.js";
import { createEconomyRouter } from "./routes/economy.js";
import {
  createResearchEngine,
  type ResearchEngine,
  type ResearchEngineOptions
} from "./research/engine.js";
import {
  createUcpDiscoveryRouter,
  createUcpCapabilityRouter,
  createUcpPaymentRouter,
  ucpIdempotencyMiddleware
} from "./ucp/index.js";

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
  researchEngine: ResearchEngine | null;
  agentAuthService: AgentAuthService | null;
  agentFaucetService: AgentFaucetService | null;
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
    | "oracleQuorumPercent"
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

export interface ApiAgentPlatformOptions extends AgentPlatformOptions {}

export interface ApiResearchOptions
  extends Pick<
    ResearchEngineOptions,
    | "enabled"
    | "tickMs"
    | "agentCount"
    | "publicationIntervalTicks"
    | "minObservations"
    | "evalThreshold"
    | "xaiApiKey"
    | "xaiModel"
    | "xaiBaseUrl"
    | "xaiMaxRetries"
    | "xaiTimeoutMs"
  > {}

export interface ApiCorsOptions {
  allowedOrigins?: string | string[];
}

export interface CreateApiServerOptions {
  apiKey?: string;
  seedAgents?: boolean;
  autonomy?: ApiAutonomyOptions;
  clawdbots?: ApiClawdbotOptions;
  research?: ApiResearchOptions;
  marketLifecycle?: ApiMarketLifecycleOptions;
  agentPlatform?: ApiAgentPlatformOptions;
  cors?: ApiCorsOptions;
}

interface ResolvedAgentPlatformOptions {
  enabled: boolean;
  agentOnlyMode: boolean;
  legacyRoutesEnabled: boolean;
  selfRegistrationEnabled: boolean;
  jwtSecret?: string;
  jwtTtlSeconds?: number;
  challengeTtlSeconds?: number;
  walletStoreSecret?: string;
  initialFundingHbar?: number;
  refillThresholdHbar?: number;
  refillTargetHbar?: number;
  refillCooldownSeconds?: number;
  refillIntervalMs?: number;
  dailyFaucetCapHbar?: number;
}

function parseBooleanOption(value: boolean | string | undefined, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "1" || normalized === "true" || normalized === "on") {
      return true;
    }

    if (normalized === "0" || normalized === "false" || normalized === "off") {
      return false;
    }
  }

  return fallback;
}

function resolveAgentPlatformOptions(input: ApiAgentPlatformOptions | undefined): ResolvedAgentPlatformOptions {
  const enabled = parseBooleanOption(
    input?.enabled ?? process.env.AGENT_PLATFORM_ENABLED,
    false
  );

  return {
    enabled,
    agentOnlyMode: parseBooleanOption(
      input?.agentOnlyMode ?? process.env.AGENT_PLATFORM_AGENT_ONLY_MODE,
      true
    ),
    legacyRoutesEnabled: parseBooleanOption(
      input?.legacyRoutesEnabled ?? process.env.AGENT_PLATFORM_LEGACY_ROUTES_ENABLED,
      false
    ),
    selfRegistrationEnabled: parseBooleanOption(
      input?.selfRegistrationEnabled ?? process.env.AGENT_PLATFORM_SELF_REGISTRATION_ENABLED,
      true
    ),
    jwtSecret: input?.jwtSecret,
    jwtTtlSeconds: input?.jwtTtlSeconds,
    challengeTtlSeconds: input?.challengeTtlSeconds,
    walletStoreSecret: input?.walletStoreSecret,
    initialFundingHbar: input?.initialFundingHbar,
    refillThresholdHbar: input?.refillThresholdHbar,
    refillTargetHbar: input?.refillTargetHbar,
    refillCooldownSeconds: input?.refillCooldownSeconds,
    refillIntervalMs: input?.refillIntervalMs,
    dailyFaucetCapHbar: input?.dailyFaucetCapHbar
  };
}

export function createApiServer(options: CreateApiServerOptions = {}): ApiServer {
  const app = express();
  const eventBus = createEventBus();
  const registry = new InMemoryAgentRegistry();
  const agentPlatform = resolveAgentPlatformOptions(options.agentPlatform);
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

  autonomyEngine.setFulfillmentProvider(clawdbotNetwork);

  const envResearchTickMs = Number(process.env.RESEARCH_TICK_MS);
  const envResearchAgentCount = Number(process.env.RESEARCH_AGENT_COUNT);
  const envResearchPubInterval = Number(process.env.RESEARCH_PUBLICATION_INTERVAL_TICKS);
  const envResearchMinObs = Number(process.env.RESEARCH_MIN_OBSERVATIONS);
  const envResearchEvalThreshold = Number(process.env.RESEARCH_EVAL_THRESHOLD);
  const envResearchMaxRetries = Number(process.env.RESEARCH_XAI_MAX_RETRIES);
  const envResearchTimeoutMs = Number(process.env.RESEARCH_XAI_TIMEOUT_MS);

  const researchEngine = createResearchEngine({
    eventBus,
    enabled: options.research?.enabled ?? (process.env.RESEARCH_ENABLED ?? "false").toLowerCase() === "true",
    tickMs: options.research?.tickMs ?? (Number.isFinite(envResearchTickMs) ? envResearchTickMs : 60_000),
    agentCount: options.research?.agentCount ?? (Number.isFinite(envResearchAgentCount) ? envResearchAgentCount : 3),
    publicationIntervalTicks: options.research?.publicationIntervalTicks ?? (Number.isFinite(envResearchPubInterval) ? envResearchPubInterval : 10),
    minObservations: options.research?.minObservations ?? (Number.isFinite(envResearchMinObs) ? envResearchMinObs : 30),
    evalThreshold: options.research?.evalThreshold ?? (Number.isFinite(envResearchEvalThreshold) ? envResearchEvalThreshold : 60),
    xaiApiKey: options.research?.xaiApiKey ?? process.env.RESEARCH_XAI_API_KEY ?? "",
    xaiModel: options.research?.xaiModel ?? process.env.RESEARCH_XAI_MODEL ?? "grok-4-1-fast-reasoning",
    xaiBaseUrl: options.research?.xaiBaseUrl ?? process.env.RESEARCH_XAI_BASE_URL ?? "https://api.x.ai/v1",
    xaiMaxRetries: options.research?.xaiMaxRetries ?? (Number.isFinite(envResearchMaxRetries) ? envResearchMaxRetries : 3),
    xaiTimeoutMs: options.research?.xaiTimeoutMs ?? (Number.isFinite(envResearchTimeoutMs) ? envResearchTimeoutMs : 120_000),
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
  const agentAuthService = agentPlatform.enabled
    ? createAgentAuthService({
        jwtSecret: agentPlatform.jwtSecret,
        jwtTtlSeconds: agentPlatform.jwtTtlSeconds,
        challengeTtlSeconds: agentPlatform.challengeTtlSeconds,
        walletStoreSecret: agentPlatform.walletStoreSecret
      })
    : null;
  const agentFaucetService =
    agentPlatform.enabled && agentAuthService
      ? createAgentFaucetService({
          authService: agentAuthService,
          initialFundingHbar: agentPlatform.initialFundingHbar,
          refillThresholdHbar: agentPlatform.refillThresholdHbar,
          refillTargetHbar: agentPlatform.refillTargetHbar,
          refillCooldownSeconds: agentPlatform.refillCooldownSeconds,
          refillIntervalMs: agentPlatform.refillIntervalMs,
          dailyFaucetCapHbar: agentPlatform.dailyFaucetCapHbar
        })
      : null;
  const legacyRoutesEnabled = !agentPlatform.enabled || agentPlatform.legacyRoutesEnabled;
  let marketLifecycleInterval: ReturnType<typeof setInterval> | null = null;
  let fundingSettlementInterval: ReturnType<typeof setInterval> | null = null;
  let optionsSweepInterval: ReturnType<typeof setInterval> | null = null;

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

  app.use(createCorsMiddleware({ allowedOrigins: options.cors?.allowedOrigins }));
  app.use(createRateLimitMiddleware({ windowMs: 60_000, maxRequests: 600 }));
  app.use(express.json());
  app.use(createAuthMiddleware({ apiKey: options.apiKey }));
  if (agentPlatform.enabled && agentPlatform.agentOnlyMode && agentAuthService) {
    app.use(createAgentOnlyModeGuard(agentAuthService));
  }
  app.use(createAutonomyMutationGuard({ strictMutations }));

  app.get("/", (_request, response) => {
    response.json({
      service: "@simulacrum/api",
      version: "0.1.0",
      status: "ok",
      agentPlatform: agentPlatform.enabled,
      onboarding: "https://simulacrum-production.up.railway.app/onboard",
      docs: "https://simulacrum-production.up.railway.app/onboard",
      ucp: {
        discovery: "GET  /.well-known/ucp",
        version: "2026-01-11",
      },
      endpoints: {
        health: "GET  /health",
        docs: "GET  /docs",
        ucp: {
          discovery: "GET  /.well-known/ucp",
          markets: "GET  /ucp/v1/markets",
          market: "GET  /ucp/v1/markets/:marketId",
          bets: "GET  /ucp/v1/markets/:marketId/bets",
          orderbook: "GET  /ucp/v1/markets/:marketId/orderbook",
          createMarket: "POST /ucp/v1/markets",
          placeBet: "POST /ucp/v1/markets/:marketId/bets",
          resolve: "POST /ucp/v1/markets/:marketId/resolve",
          claim: "POST /ucp/v1/markets/:marketId/claims",
          selfAttest: "POST /ucp/v1/markets/:marketId/self-attest",
          challenge: "POST /ucp/v1/markets/:marketId/challenge",
          oracleVote: "POST /ucp/v1/markets/:marketId/oracle-vote",
          reputation: "GET  /ucp/v1/reputation/:accountId",
          leaderboard: "GET  /ucp/v1/reputation/leaderboard",
          trustGraph: "GET  /ucp/v1/reputation/trust-graph",
          attestation: "POST /ucp/v1/reputation/attestations",
          paymentTransfer: "POST /ucp/v1/payment/transfer",
          paymentBalance: "GET  /ucp/v1/payment/balance/:account_id",
        },
        auth: {
          register: "POST /agent/v1/auth/register",
          challenge: "POST /agent/v1/auth/challenge",
          verify: "POST /agent/v1/auth/verify",
          refresh: "POST /agent/v1/auth/refresh",
        },
        agent: {
          me: "GET  /agent/v1/me",
          markets: "GET  /agent/v1/markets",
          walletBalance: "GET  /agent/v1/wallet/balance",
          faucet: "POST /agent/v1/wallet/faucet/request",
        },
        services: {
          list: "GET  /services",
          detail: "GET  /services/:serviceId",
          register: "POST /services",
          request: "POST /services/:serviceId/request",
          accept: "POST /services/:serviceId/requests/:requestId/accept",
          complete: "POST /services/:serviceId/requests/:requestId/complete",
          review: "POST /services/:serviceId/reviews",
        },
        tasks: {
          list: "GET  /tasks",
          detail: "GET  /tasks/:taskId",
          create: "POST /tasks",
          bid: "POST /tasks/:taskId/bid",
          acceptBid: "POST /tasks/:taskId/bids/:bidId/accept",
          submit: "POST /tasks/:taskId/submit",
          approve: "POST /tasks/:taskId/approve",
          dispute: "POST /tasks/:taskId/dispute",
        },
        economy: {
          overview: "GET  /economy/overview",
          metrics: "GET  /economy/metrics",
          agentPortfolio: "GET  /economy/agents/:accountId",
          leaderboard: "GET  /economy/leaderboard",
          activity: "GET  /economy/activity",
        },
        public: {
          markets: "GET  /markets",
          agents: "GET  /agents",
          reputation: "GET  /reputation/:accountId",
          research: "GET  /research/observations",
          ws: "WS   /ws",
        },
      },
    });
  });

  app.get("/health", (_request, response) => {
    response.json({ ok: true, service: "@simulacrum/api" });
  });

  app.get("/events/recent", (request, response) => {
    const rawLimit = Number(request.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 200;
    response.json({ events: eventBus.recentEvents(limit) });
  });

  // Serve OpenAPI spec at /docs
  const openapiSpecPath = join(dirname(fileURLToPath(import.meta.url)), "..", "openapi.json");
  try {
    const openapiSpec = JSON.parse(readFileSync(openapiSpecPath, "utf-8"));
    app.get("/docs", (_request, response) => {
      response.json(openapiSpec);
    });
  } catch {
    // openapi.json not available in this build — skip /docs endpoint
  }

  if (agentPlatform.enabled && agentAuthService && agentFaucetService) {
    // IP-based rate limit on auth endpoints (register/challenge/verify)
    const authRateLimit = createRateLimitMiddleware({ windowMs: 60_000, maxRequests: 20 });
    // Per-agent rate limit on authenticated endpoints — keys by agentId when available, falls back to IP
    const agentRateLimit = createRateLimitMiddleware({
      windowMs: 60_000,
      maxRequests: 60,
      keyGenerator: (request) =>
        request.agentContext?.agentId ?? request.ip ?? request.socket.remoteAddress ?? "unknown"
    });
    app.use(
      "/agent/v1/auth",
      authRateLimit
    );
    app.use(
      "/agent/v1",
      agentRateLimit,
      createAgentV1Router({
        eventBus,
        authService: agentAuthService,
        faucetService: agentFaucetService,
        selfRegistrationEnabled: agentPlatform.selfRegistrationEnabled
      })
    );
  }

  // ── UCP Compliance Layer ──
  // Discovery endpoint (no auth — agents must discover capabilities)
  app.use(createUcpDiscoveryRouter());
  // UCP capability routes with idempotency support
  app.use("/ucp/v1", ucpIdempotencyMiddleware, createUcpCapabilityRouter({ eventBus }));
  // UCP payment handler routes
  app.use("/ucp/v1/payment", ucpIdempotencyMiddleware, createUcpPaymentRouter({ eventBus }));

  // Research routes are always available (read-only observations)
  app.use("/research", createResearchRouter(researchEngine));

  // Agent economy routes (services marketplace, task board, economy dashboard)
  app.use("/services", createServicesRouter(eventBus, clawdbotNetwork));
  app.use("/tasks", createTasksRouter(eventBus));
  app.use("/economy", createEconomyRouter(eventBus));
  app.use("/derivatives", createDerivativesRouter(eventBus));

  if (legacyRoutesEnabled) {
    app.use("/markets", createMarketsRouter(eventBus));
    app.use("/agents", createAgentsRouter(registry, eventBus));
    app.use("/autonomy", createAutonomyRouter(autonomyEngine));
    app.use("/clawdbots", createClawdbotsRouter(clawdbotNetwork));
    app.use("/reputation", createReputationRouter(eventBus));
    app.use("/insurance", createInsuranceRouter(eventBus));
  }

  const httpServer = createServer(app);
  const webSocketServer = new WebSocketServer({ server: httpServer, path: "/ws" });

  // Authenticate WebSocket connections when agent-only mode is active.
  // When legacy routes are enabled the UI connects without a token.
  // Clients connect with: ws://host/ws?token=<JWT>
  webSocketServer.on("connection", (ws, request) => {
    if (agentAuthService && agentPlatform.agentOnlyMode) {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      const token = url.searchParams.get("token");

      if (!token) {
        ws.close(4001, "Missing authentication token. Connect with ?token=<JWT>.");
        return;
      }

      try {
        agentAuthService.verifyAccessToken(token);
      } catch {
        ws.close(4003, "Invalid or expired token.");
        return;
      }
    }
  });

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
    researchEngine,
    agentAuthService,
    agentFaucetService,
    async start(port = 3001): Promise<number> {
      await new Promise<void>((resolve) => {
        httpServer.listen(port, () => resolve());
      });

      if (agentFaucetService) {
        agentFaucetService.start();
      }
      if (autonomyEngine) {
        await autonomyEngine.start();
      }
      if (clawdbotNetwork) {
        try {
          await clawdbotNetwork.start();
        } catch (error) {
          console.error("[server] ClawDBot network failed to start (server continues):", error instanceof Error ? error.message : error);
        }
      }
      if (researchEngine) {
        try {
          await researchEngine.start();
        } catch (error) {
          console.error("[server] Research engine failed to start (server continues):", error instanceof Error ? error.message : error);
        }
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

      // ── Funding Settlement Scheduler ──
      const envFundingTickMs = Number(process.env.FUNDING_SETTLEMENT_TICK_MS);
      const fundingTickMs = Number.isFinite(envFundingTickMs) && envFundingTickMs > 0
        ? envFundingTickMs
        : 3_600_000; // 1 hour default

      runFundingSettlementSweep({ eventBus });
      fundingSettlementInterval = setInterval(() => {
        runFundingSettlementSweep({ eventBus });
      }, fundingTickMs);

      // ── Options Mark-to-Market Scheduler ──
      const envOptionsSweepMs = Number(process.env.OPTIONS_SWEEP_TICK_MS);
      const optionsSweepMs = Number.isFinite(envOptionsSweepMs) && envOptionsSweepMs > 0
        ? envOptionsSweepMs
        : 15_000; // 15 seconds default

      runOptionsSweep({ eventBus });
      optionsSweepInterval = setInterval(() => {
        runOptionsSweep({ eventBus });
      }, optionsSweepMs);

      const address = httpServer.address();

      if (typeof address === "object" && address && typeof address.port === "number") {
        return address.port;
      }

      return port;
    },
    async stop(): Promise<void> {
      if (optionsSweepInterval) {
        clearInterval(optionsSweepInterval);
        optionsSweepInterval = null;
      }
      if (fundingSettlementInterval) {
        clearInterval(fundingSettlementInterval);
        fundingSettlementInterval = null;
      }
      if (marketLifecycleInterval) {
        clearInterval(marketLifecycleInterval);
        marketLifecycleInterval = null;
      }

      if (researchEngine) {
        await researchEngine.stop();
      }
      if (clawdbotNetwork) {
        await clawdbotNetwork.stop();
      }
      if (autonomyEngine) {
        await autonomyEngine.stop();
      }
      if (agentFaucetService) {
        agentFaucetService.stop();
      }
      if (agentAuthService) {
        agentAuthService.close();
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
