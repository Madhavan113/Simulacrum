import { Router } from "express";
import { z } from "zod";
import {
  acceptRequest,
  cancelRequest,
  completeRequest,
  disputeRequest,
  getServiceStore,
  registerService,
  requestService,
  reviewService,
  updateService
} from "@simulacrum/services";

import type { ApiEventBus } from "../events.js";
import type { ClawdbotNetwork } from "../clawdbots/network.js";
import { validateBody } from "../middleware/validation.js";

const registerServiceSchema = z.object({
  providerAccountId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(["COMPUTE", "DATA", "RESEARCH", "ANALYSIS", "ORACLE", "CUSTOM"]),
  priceHbar: z.number().positive(),
  tags: z.array(z.string()).optional()
});

const updateServiceSchema = z.object({
  providerAccountId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  priceHbar: z.number().positive().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "RETIRED"]).optional(),
  tags: z.array(z.string()).optional()
});

const requestServiceSchema = z.object({
  requesterAccountId: z.string().min(1),
  input: z.string().min(1)
});

const acceptRequestSchema = z.object({
  providerAccountId: z.string().min(1)
});

const completeRequestSchema = z.object({
  providerAccountId: z.string().min(1),
  output: z.string().min(1)
});

const disputeRequestSchema = z.object({
  requesterAccountId: z.string().min(1),
  reason: z.string().min(1)
});

const cancelRequestSchema = z.object({
  requesterAccountId: z.string().min(1)
});

const reviewServiceSchema = z.object({
  serviceRequestId: z.string().min(1),
  reviewerAccountId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(1)
});

const buyServiceSchema = z.object({
  input: z.string().min(1),
  payerAccountId: z.string().optional()
});

export function createServicesRouter(eventBus: ApiEventBus, clawdbotNetwork?: ClawdbotNetwork): Router {
  const router = Router();

  router.get("/", (_request, response) => {
    const store = getServiceStore();
    response.json({
      services: Array.from(store.services.values())
    });
  });

  router.get("/:serviceId", (request, response) => {
    const store = getServiceStore();
    const service = store.services.get(request.params.serviceId);

    if (!service) {
      response.status(404).json({ error: `Service ${request.params.serviceId} not found` });
      return;
    }

    const reviews = store.reviews.get(request.params.serviceId) ?? [];
    const requests = Array.from(store.requests.values()).filter(
      (r) => r.serviceId === request.params.serviceId
    );

    response.json({ service, reviews, requests });
  });

  router.post("/", validateBody(registerServiceSchema), async (request, response) => {
    try {
      const result = await registerService(request.body);
      eventBus.publish("service.registered", result.service);
      response.status(201).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.status(400).json({ error: message });
    }
  });

  router.patch("/:serviceId", validateBody(updateServiceSchema), (request, response) => {
    try {
      const service = updateService({
        serviceId: request.params.serviceId,
        ...request.body
      });
      eventBus.publish("service.updated", service);
      response.json({ service });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.status(400).json({ error: message });
    }
  });

  router.post(
    "/:serviceId/request",
    validateBody(requestServiceSchema),
    async (request, response) => {
      try {
        const serviceRequest = await requestService({
          serviceId: request.params.serviceId,
          ...request.body
        });
        eventBus.publish("service.requested", serviceRequest);
        response.status(201).json({ request: serviceRequest });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        response.status(400).json({ error: message });
      }
    }
  );

  router.post(
    "/:serviceId/requests/:requestId/accept",
    validateBody(acceptRequestSchema),
    async (request, response) => {
      try {
        const serviceRequest = await acceptRequest({
          serviceId: request.params.serviceId,
          requestId: request.params.requestId,
          ...request.body
        });
        eventBus.publish("service.accepted", serviceRequest);
        response.json({ request: serviceRequest });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        response.status(400).json({ error: message });
      }
    }
  );

  router.post(
    "/:serviceId/requests/:requestId/complete",
    validateBody(completeRequestSchema),
    async (request, response) => {
      try {
        const serviceRequest = await completeRequest({
          serviceId: request.params.serviceId,
          requestId: request.params.requestId,
          ...request.body
        });
        eventBus.publish("service.completed", serviceRequest);
        response.json({ request: serviceRequest });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        response.status(400).json({ error: message });
      }
    }
  );

  router.post(
    "/:serviceId/requests/:requestId/dispute",
    validateBody(disputeRequestSchema),
    async (request, response) => {
      try {
        const serviceRequest = await disputeRequest({
          serviceId: request.params.serviceId,
          requestId: request.params.requestId,
          ...request.body
        });
        eventBus.publish("service.disputed", serviceRequest);
        response.json({ request: serviceRequest });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        response.status(400).json({ error: message });
      }
    }
  );

  router.post(
    "/:serviceId/requests/:requestId/cancel",
    validateBody(cancelRequestSchema),
    async (request, response) => {
      try {
        const serviceRequest = await cancelRequest({
          serviceId: request.params.serviceId,
          requestId: request.params.requestId,
          ...request.body
        });
        eventBus.publish("service.cancelled", serviceRequest);
        response.json({ request: serviceRequest });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        response.status(400).json({ error: message });
      }
    }
  );

  router.post(
    "/:serviceId/reviews",
    validateBody(reviewServiceSchema),
    async (request, response) => {
      try {
        const review = await reviewService({
          serviceId: request.params.serviceId,
          ...request.body
        });
        eventBus.publish("service.reviewed", review);
        response.status(201).json({ review });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        response.status(400).json({ error: message });
      }
    }
  );

  router.post(
    "/:serviceId/buy",
    validateBody(buyServiceSchema),
    async (request, response) => {
      const store = getServiceStore();
      const service = store.services.get(request.params.serviceId);

      if (!service) {
        response.status(404).json({ error: `Service ${request.params.serviceId} not found` });
        return;
      }

      if (service.status !== "ACTIVE") {
        response.status(400).json({ error: `Service is ${service.status}, not available for purchase.` });
        return;
      }

      if (!clawdbotNetwork) {
        response.status(503).json({ error: "MoltBook fulfillment unavailable — clawdbot network not running." });
        return;
      }

      const requesterAccountId = request.body.payerAccountId || process.env.HEDERA_ACCOUNT_ID || "demo";

      try {
        const serviceRequest = await requestService({
          serviceId: service.id,
          requesterAccountId,
          input: request.body.input
        });
        eventBus.publish("service.requested", serviceRequest);

        await acceptRequest({
          serviceId: service.id,
          requestId: serviceRequest.id,
          providerAccountId: service.providerAccountId
        });
        eventBus.publish("service.accepted", serviceRequest);

        const output = await clawdbotNetwork.fulfillServiceRequest(
          service.providerAccountId,
          service.name,
          service.description,
          request.body.input
        );

        const completed = await completeRequest({
          serviceId: service.id,
          requestId: serviceRequest.id,
          providerAccountId: service.providerAccountId,
          output
        });
        eventBus.publish("service.completed", completed);

        response.json({
          request: completed,
          output,
          service: { id: service.id, name: service.name, providerAccountId: service.providerAccountId },
          moltbook: true
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        response.status(500).json({ error: message });
      }
    }
  );

  return router;
}
