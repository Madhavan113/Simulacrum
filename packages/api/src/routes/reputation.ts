import { Router } from "express";
import { z } from "zod";
import {
  buildReputationLeaderboard,
  buildTrustGraph,
  calculateReputationScore,
  createRepToken,
  getReputationStore,
  listAttestations,
  submitAttestation
} from "@simulacrum/reputation";

import type { ApiEventBus } from "../events.js";
import { validateBody } from "../middleware/validation.js";

const createTokenSchema = z.object({
  treasuryAccountId: z.string().min(1),
  name: z.string().optional(),
  symbol: z.string().optional(),
  initialSupply: z.number().int().nonnegative().optional()
});

const attestationSchema = z.object({
  subjectAccountId: z.string().min(1),
  attesterAccountId: z.string().min(1),
  scoreDelta: z.number(),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
  tags: z.array(z.string()).optional()
});

export function createReputationRouter(eventBus: ApiEventBus): Router {
  const router = Router();

  router.post("/token", validateBody(createTokenSchema), async (request, response) => {
    try {
      const token = await createRepToken(request.body);
      eventBus.publish("reputation.token.created", token);
      response.status(201).json({ token });
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/attestations", validateBody(attestationSchema), async (request, response) => {
    try {
      const attestation = await submitAttestation(request.body);
      eventBus.publish("reputation.attested", attestation);
      response.status(201).json({ attestation });
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/attestations", async (_request, response) => {
    const store = getReputationStore();

    if (!store.topicId) {
      response.json({ attestations: [] });
      return;
    }

    try {
      const attestations = await listAttestations(store.topicId);
      response.json({ attestations });
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/score/:accountId", (request, response) => {
    const store = getReputationStore();
    const score = calculateReputationScore(request.params.accountId, store.attestations);

    response.json({ score });
  });

  router.get("/leaderboard", (_request, response) => {
    const store = getReputationStore();
    const leaderboard = buildReputationLeaderboard(store.attestations);

    response.json({ leaderboard });
  });

  router.get("/trust-graph", (_request, response) => {
    const store = getReputationStore();
    const graph = buildTrustGraph(store.attestations);

    response.json({ graph });
  });

  return router;
}
