import { Router } from "express";
import { z } from "zod";
import {
  createInsurancePool,
  depositLiquidity,
  getInsuranceStore,
  processClaim,
  reserveCoverage,
  underwriteCommitment
} from "@simulacrum/insurance";

import type { ApiEventBus } from "../events.js";
import { validateBody } from "../middleware/validation.js";

const underwriteSchema = z.object({
  marketId: z.string().min(1),
  underwriterAccountId: z.string().min(1),
  beneficiaryAccountId: z.string().min(1),
  coverageAmountHbar: z.number().positive(),
  premiumRateBps: z.number().positive(),
  expirationTime: z.string().min(1),
  escrowAccountId: z.string().optional()
});

const claimSchema = z.object({
  claimantAccountId: z.string().min(1),
  triggerReason: z.string().min(1),
  payoutAmountHbar: z.number().positive().optional()
});

const createPoolSchema = z.object({
  managerAccountId: z.string().min(1),
  escrowAccountId: z.string().min(1),
  initialLiquidityHbar: z.number().positive()
});

const depositSchema = z.object({
  accountId: z.string().min(1),
  amountHbar: z.number().positive()
});

const reserveSchema = z.object({
  amountHbar: z.number().positive()
});

export function createInsuranceRouter(eventBus: ApiEventBus): Router {
  const router = Router();

  router.get("/policies", (_request, response) => {
    const store = getInsuranceStore();
    response.json({ policies: Array.from(store.policies.values()) });
  });

  router.post("/policies", validateBody(underwriteSchema), async (request, response) => {
    try {
      const policy = await underwriteCommitment(request.body);
      eventBus.publish("insurance.policy.created", policy);
      response.status(201).json({ policy });
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.post(
    "/policies/:policyId/claims",
    validateBody(claimSchema),
    async (request, response) => {
      try {
        const policy = await processClaim({
          policyId: request.params.policyId,
          ...request.body
        });
        eventBus.publish("insurance.policy.claimed", policy);
        response.status(200).json({ policy });
      } catch (error) {
        response.status(400).json({ error: (error as Error).message });
      }
    }
  );

  router.get("/pools", (_request, response) => {
    const store = getInsuranceStore();
    response.json({ pools: Array.from(store.pools.values()) });
  });

  router.post("/pools", validateBody(createPoolSchema), async (request, response) => {
    try {
      const pool = await createInsurancePool(
        request.body.managerAccountId,
        request.body.escrowAccountId,
        request.body.initialLiquidityHbar
      );
      eventBus.publish("insurance.pool.created", pool);
      response.status(201).json({ pool });
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/pools/:poolId/deposit", validateBody(depositSchema), async (request, response) => {
    try {
      const pool = await depositLiquidity(
        request.params.poolId,
        request.body.accountId,
        request.body.amountHbar
      );
      eventBus.publish("insurance.pool.deposited", pool);
      response.status(200).json({ pool });
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/pools/:poolId/reserve", validateBody(reserveSchema), (request, response) => {
    try {
      const pool = reserveCoverage(request.params.poolId, request.body.amountHbar);
      eventBus.publish("insurance.pool.reserved", pool);
      response.status(200).json({ pool });
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
}
