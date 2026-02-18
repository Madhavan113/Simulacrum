import { Router } from "express";
import { z } from "zod";

import type { AutonomyChallengeInput, AutonomyEngine } from "../autonomy/engine.js";
import { validateBody } from "../middleware/validation.js";

const challengeSchema = z.object({
  question: z.string().min(1),
  outcomes: z.array(z.string().min(1)).optional(),
  closeMinutes: z.number().int().positive().optional(),
  challengerAgentId: z.string().optional(),
  targetAgentId: z.string().optional()
});

export function createAutonomyRouter(engine: AutonomyEngine | null): Router {
  const router = Router();

  router.get("/status", (_request, response) => {
    if (!engine) {
      response.json({
        enabled: false,
        running: false,
        reason: "Autonomy engine not configured"
      });
      return;
    }

    response.json(engine.getStatus());
  });

  router.post("/start", async (_request, response) => {
    if (!engine) {
      response.status(400).json({ error: "Autonomy engine not configured" });
      return;
    }

    await engine.start();
    response.json(engine.getStatus());
  });

  router.post("/stop", async (_request, response) => {
    if (!engine) {
      response.status(400).json({ error: "Autonomy engine not configured" });
      return;
    }

    await engine.stop();
    response.json(engine.getStatus());
  });

  router.post("/run-now", async (_request, response) => {
    if (!engine) {
      response.status(400).json({ error: "Autonomy engine not configured" });
      return;
    }

    await engine.runTick();
    response.json(engine.getStatus());
  });

  router.post(
    "/challenges",
    validateBody(challengeSchema),
    async (request, response) => {
      if (!engine) {
        response.status(400).json({ error: "Autonomy engine not configured" });
        return;
      }

      try {
        const market = await engine.createChallengeMarket(request.body as AutonomyChallengeInput);
        response.status(201).json(market);
      } catch (error) {
        response.status(400).json({ error: (error as Error).message });
      }
    }
  );

  return router;
}
