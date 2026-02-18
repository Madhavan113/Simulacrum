import { Router } from "express";
import { z } from "zod";

import type {
  ClawdbotNetwork,
  CreateClawdbotEventMarketInput,
  JoinClawdbotInput,
  PlaceClawdbotBetInput,
  PlaceClawdbotOrderInput,
  RegisterHostedClawdbotInput,
  ResolveClawdbotMarketInput
} from "../clawdbots/network.js";
import { validateBody } from "../middleware/validation.js";

function demoBackdoorEnabled(): boolean {
  return (process.env.DEMO_BACKDOOR_ENABLED ?? "false").toLowerCase() === "true";
}

function hostedControlEnabled(): boolean {
  return (process.env.CLAWDBOT_HOSTED_CONTROL_ENABLED ?? "true").toLowerCase() !== "false";
}

function goalsApiEnabled(): boolean {
  return (process.env.CLAWDBOT_GOALS_ENABLED ?? "true").toLowerCase() !== "false";
}

function isLocalhostAddress(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim();
  return (
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "::ffff:127.0.0.1" ||
    normalized.startsWith("127.")
  );
}

function isLocalhostRequest(pathIp: string | undefined, forwardedFor: string | string[] | undefined): boolean {
  const firstForwarded = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(",")[0]?.trim();

  if (firstForwarded) {
    return isLocalhostAddress(firstForwarded);
  }

  return isLocalhostAddress(pathIp);
}

const messageSchema = z.object({
  text: z.string().min(1),
  botId: z.string().optional()
});

const joinSchema = z.object({
  name: z.string().min(1),
  accountId: z.string().min(1),
  privateKey: z.string().min(1),
  privateKeyType: z.enum(["auto", "der", "ecdsa", "ed25519"]).optional(),
  strategy: z.enum(["random", "reputation", "contrarian"]).optional(),
  mode: z.enum(["AGGRESSIVE", "BALANCED", "CONSERVATIVE"]).optional(),
  bankrollHbar: z.number().positive().optional(),
  reputationScore: z.number().min(0).max(100).optional(),
  llm: z
    .object({
      provider: z.enum(["openai"]).optional(),
      apiKey: z.string().min(1).optional(),
      model: z.string().min(1).optional(),
      baseUrl: z.string().min(1).optional()
    })
    .optional()
});

const hostedRegisterSchema = joinSchema.extend({
  ownerId: z.string().min(1)
});

const rotateCredentialsSchema = z.object({
  privateKey: z.string().min(1).optional(),
  privateKeyType: z.enum(["auto", "der", "ecdsa", "ed25519"]).optional(),
  llm: z
    .object({
      provider: z.enum(["openai"]).optional(),
      apiKey: z.string().min(1).optional(),
      model: z.string().min(1).optional(),
      baseUrl: z.string().min(1).optional()
    })
    .optional()
});

const marketSchema = z.object({
  prompt: z.string().optional(),
  outcomes: z.array(z.string().min(1)).optional(),
  initialOddsByOutcome: z.record(z.number().positive()).optional(),
  lowLiquidity: z.boolean().optional(),
  liquidityModel: z.enum(["CLOB", "WEIGHTED_CURVE"]).optional(),
  curveLiquidityHbar: z.number().positive().optional(),
  creatorBotId: z.string().optional(),
  closeMinutes: z.number().int().positive().optional()
});

const botMarketSchema = z.object({
  prompt: z.string().optional(),
  outcomes: z.array(z.string().min(1)).optional(),
  initialOddsByOutcome: z.record(z.number().positive()).optional(),
  lowLiquidity: z.boolean().optional(),
  liquidityModel: z.enum(["CLOB", "WEIGHTED_CURVE"]).optional(),
  curveLiquidityHbar: z.number().positive().optional(),
  closeMinutes: z.number().int().positive().optional()
});

const botBetSchema = z.object({
  marketId: z.string().min(1),
  outcome: z.string().min(1),
  amountHbar: z.number().positive()
});

const botOrderSchema = z.object({
  marketId: z.string().min(1),
  outcome: z.string().min(1),
  side: z.enum(["BID", "ASK"]),
  quantity: z.number().positive(),
  price: z.number().positive()
});

const botResolveSchema = z.object({
  marketId: z.string().min(1),
  resolvedOutcome: z.string().min(1),
  reason: z.string().optional()
});

const botMessageSchema = z.object({
  text: z.string().min(1)
});

export function createClawdbotsRouter(network: ClawdbotNetwork | null): Router {
  const router = Router();

  router.get("/status", (_request, response) => {
    if (!network) {
      response.json({
        enabled: false,
        running: false,
        reason: "Clawdbot network not configured"
      });
      return;
    }

    response.json(network.getStatus());
  });

  router.get("/thread", (request, response) => {
    if (!network) {
      response.status(400).json({ error: "Clawdbot network not configured" });
      return;
    }

    const rawLimit = Number(request.query.limit);
    const limit = Number.isFinite(rawLimit) ? rawLimit : 50;
    response.json({ messages: network.getThread(limit) });
  });

  router.get("/bots", (_request, response) => {
    if (!network) {
      response.status(400).json({ error: "Clawdbot network not configured" });
      return;
    }

    response.json({ bots: network.listBots() });
  });

  router.get("/goals", (request, response) => {
    if (!network) {
      response.status(400).json({ error: "Clawdbot network not configured" });
      return;
    }
    if (!goalsApiEnabled()) {
      response.status(403).json({ error: "Goals API is disabled by feature flag." });
      return;
    }

    const botId = typeof request.query.botId === "string" ? request.query.botId : undefined;
    response.json({ goals: network.listGoals(botId) });
  });

  router.post("/join", validateBody(joinSchema), async (request, response) => {
    if (!network) {
      response.status(400).json({ error: "Clawdbot network not configured" });
      return;
    }

    try {
      const bot = await network.joinCommunityBot(request.body as JoinClawdbotInput);
      response.status(201).json({ bot });
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/register", validateBody(hostedRegisterSchema), async (request, response) => {
    if (!network) {
      response.status(400).json({ error: "Clawdbot network not configured" });
      return;
    }
    if (!hostedControlEnabled()) {
      response.status(403).json({ error: "Hosted control plane is disabled by feature flag." });
      return;
    }

    try {
      const result = await network.registerHostedBot(request.body as RegisterHostedClawdbotInput);
      response.status(201).json(result);
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/start", async (_request, response) => {
    if (!network) {
      response.status(400).json({ error: "Clawdbot network not configured" });
      return;
    }

    await network.start();
    response.json(network.getStatus());
  });

  router.post("/stop", async (_request, response) => {
    if (!network) {
      response.status(400).json({ error: "Clawdbot network not configured" });
      return;
    }

    await network.stop();
    response.json(network.getStatus());
  });

  router.post("/run-now", async (_request, response) => {
    if (!network) {
      response.status(400).json({ error: "Clawdbot network not configured" });
      return;
    }

    await network.runTick();
    response.json(network.getStatus());
  });

  router.post("/bots/:botId/start", (request, response) => {
    if (!network) {
      response.status(400).json({ error: "Clawdbot network not configured" });
      return;
    }

    if (!hostedControlEnabled()) {
      response.status(403).json({ error: "Hosted control plane is disabled by feature flag." });
      return;
    }

    try {
      response.status(200).json(network.startHostedBot(request.params.botId));
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/bots/:botId/stop", (request, response) => {
    if (!network) {
      response.status(400).json({ error: "Clawdbot network not configured" });
      return;
    }

    if (!hostedControlEnabled()) {
      response.status(403).json({ error: "Hosted control plane is disabled by feature flag." });
      return;
    }

    try {
      response.status(200).json(network.stopHostedBot(request.params.botId));
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/bots/:botId/suspend", (request, response) => {
    if (!network) {
      response.status(400).json({ error: "Clawdbot network not configured" });
      return;
    }

    if (!hostedControlEnabled()) {
      response.status(403).json({ error: "Hosted control plane is disabled by feature flag." });
      return;
    }

    try {
      response.status(200).json(network.suspendHostedBot(request.params.botId, true));
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/bots/:botId/unsuspend", (request, response) => {
    if (!network) {
      response.status(400).json({ error: "Clawdbot network not configured" });
      return;
    }

    if (!hostedControlEnabled()) {
      response.status(403).json({ error: "Hosted control plane is disabled by feature flag." });
      return;
    }

    try {
      response.status(200).json(network.suspendHostedBot(request.params.botId, false));
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/bots/:botId/status", (request, response) => {
    if (!network) {
      response.status(400).json({ error: "Clawdbot network not configured" });
      return;
    }

    if (!hostedControlEnabled()) {
      response.status(403).json({ error: "Hosted control plane is disabled by feature flag." });
      return;
    }

    try {
      response.status(200).json(network.getHostedBotStatus(request.params.botId));
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.patch(
    "/bots/:botId/credentials",
    validateBody(rotateCredentialsSchema),
    (request, response) => {
      if (!network) {
        response.status(400).json({ error: "Clawdbot network not configured" });
        return;
      }
      if (!hostedControlEnabled()) {
        response.status(403).json({ error: "Hosted control plane is disabled by feature flag." });
        return;
      }

      try {
        response.status(200).json(
          network.rotateHostedBotCredentials(request.params.botId, request.body)
        );
      } catch (error) {
        response.status(400).json({ error: (error as Error).message });
      }
    }
  );

  router.post("/demo/scripted-timeline", async (request, response) => {
    if (!network) {
      response.status(400).json({ error: "Clawdbot network not configured" });
      return;
    }

    if (!demoBackdoorEnabled()) {
      response.status(403).json({ error: "Demo backdoor is disabled." });
      return;
    }

    if (!isLocalhostRequest(request.ip, request.headers["x-forwarded-for"])) {
      response.status(403).json({ error: "Demo backdoor is restricted to localhost." });
      return;
    }

    try {
      const run = await network.runScriptedTimelineDemo();
      response.status(202).json({
        ...run,
        demo: true,
        warning: "Demo-only backdoor endpoint. Do not enable outside local demos."
      });
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/message", validateBody(messageSchema), (request, response) => {
    if (!network) {
      response.status(400).json({ error: "Clawdbot network not configured" });
      return;
    }

    const message = network.postMessage(request.body.text, request.body.botId);
    response.status(201).json({ message });
  });

  router.post(
    "/bots/:botId/message",
    validateBody(botMessageSchema),
    (request, response) => {
      if (!network) {
        response.status(400).json({ error: "Clawdbot network not configured" });
        return;
      }

      try {
        const message = network.postBotMessage(request.params.botId, request.body.text);
        response.status(201).json({ message });
      } catch (error) {
        response.status(400).json({ error: (error as Error).message });
      }
    }
  );

  router.post("/markets", validateBody(marketSchema), async (request, response) => {
    if (!network) {
      response.status(400).json({ error: "Clawdbot network not configured" });
      return;
    }

    try {
      const market = await network.createEventMarket(request.body as CreateClawdbotEventMarketInput);
      response.status(201).json(market);
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.post(
    "/bots/:botId/markets",
    validateBody(botMarketSchema),
    async (request, response) => {
      if (!network) {
        response.status(400).json({ error: "Clawdbot network not configured" });
        return;
      }

      try {
        const market = await network.createMarketAsBot(
          request.params.botId,
          request.body as Omit<CreateClawdbotEventMarketInput, "creatorBotId">
        );
        response.status(201).json(market);
      } catch (error) {
        response.status(400).json({ error: (error as Error).message });
      }
    }
  );

  router.post(
    "/bots/:botId/bets",
    validateBody(botBetSchema),
    async (request, response) => {
      if (!network) {
        response.status(400).json({ error: "Clawdbot network not configured" });
        return;
      }

      try {
        const bet = await network.placeBetAsBot(
          request.params.botId,
          request.body as PlaceClawdbotBetInput
        );
        response.status(201).json(bet);
      } catch (error) {
        response.status(400).json({ error: (error as Error).message });
      }
    }
  );

  router.post(
    "/bots/:botId/orders",
    validateBody(botOrderSchema),
    async (request, response) => {
      if (!network) {
        response.status(400).json({ error: "Clawdbot network not configured" });
        return;
      }

      try {
        const order = await network.placeOrderAsBot(
          request.params.botId,
          request.body as PlaceClawdbotOrderInput
        );
        response.status(201).json(order);
      } catch (error) {
        response.status(400).json({ error: (error as Error).message });
      }
    }
  );

  router.get("/bots/:botId/orders", (request, response) => {
    if (!network) {
      response.status(400).json({ error: "Clawdbot network not configured" });
      return;
    }

    try {
      const status = typeof request.query.status === "string" ? request.query.status.toUpperCase() : undefined;
      const orders = network.listOrdersForBot(request.params.botId, status === "OPEN");
      response.status(200).json({ orders });
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.post(
    "/bots/:botId/resolve",
    validateBody(botResolveSchema),
    async (request, response) => {
      if (!network) {
        response.status(400).json({ error: "Clawdbot network not configured" });
        return;
      }

      try {
        const resolution = await network.resolveMarketAsBot(
          request.params.botId,
          request.body as ResolveClawdbotMarketInput
        );
        response.status(200).json(resolution);
      } catch (error) {
        response.status(400).json({ error: (error as Error).message });
      }
    }
  );

  return router;
}
