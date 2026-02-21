import { Router } from "express";
import { z } from "zod";
import {
  acceptBid,
  approveWork,
  bidOnTask,
  cancelTask,
  createTask,
  disputeWork,
  getTaskStore,
  submitWork
} from "@simulacrum/tasks";

import type { ApiEventBus } from "../events.js";
import { validateBody } from "../middleware/validation.js";

const createTaskSchema = z.object({
  posterAccountId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(["RESEARCH", "PREDICTION", "DATA_COLLECTION", "ANALYSIS", "DEVELOPMENT", "CUSTOM"]),
  bountyHbar: z.number().positive(),
  deadline: z.string().min(1),
  requiredReputation: z.number().min(0).optional(),
  maxBids: z.number().int().positive().optional()
});

const bidSchema = z.object({
  bidderAccountId: z.string().min(1),
  proposedPriceHbar: z.number().positive(),
  estimatedCompletion: z.string().min(1),
  proposal: z.string().min(1)
});

const acceptBidSchema = z.object({
  posterAccountId: z.string().min(1)
});

const submitWorkSchema = z.object({
  submitterAccountId: z.string().min(1),
  deliverable: z.string().min(1)
});

const approveWorkSchema = z.object({
  posterAccountId: z.string().min(1)
});

const disputeWorkSchema = z.object({
  posterAccountId: z.string().min(1),
  reason: z.string().min(1)
});

const cancelTaskSchema = z.object({
  posterAccountId: z.string().min(1)
});

export function createTasksRouter(eventBus: ApiEventBus): Router {
  const router = Router();

  router.get("/", (request, response) => {
    const store = getTaskStore();
    let tasks = Array.from(store.tasks.values());

    const status = request.query.status as string | undefined;
    if (status) {
      tasks = tasks.filter((t) => t.status === status);
    }

    const category = request.query.category as string | undefined;
    if (category) {
      tasks = tasks.filter((t) => t.category === category);
    }

    response.json({ tasks });
  });

  router.get("/:taskId", (request, response) => {
    const store = getTaskStore();
    const task = store.tasks.get(request.params.taskId);

    if (!task) {
      response.status(404).json({ error: `Task ${request.params.taskId} not found` });
      return;
    }

    const bids = store.bids.get(request.params.taskId) ?? [];
    const submissions = store.submissions.get(request.params.taskId) ?? [];

    response.json({ task, bids, submissions });
  });

  router.post("/", validateBody(createTaskSchema), async (request, response) => {
    try {
      const result = await createTask(request.body);
      eventBus.publish("task.created", result.task);
      response.status(201).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.status(400).json({ error: message });
    }
  });

  router.post(
    "/:taskId/bid",
    validateBody(bidSchema),
    async (request, response) => {
      try {
        const bid = await bidOnTask({
          taskId: request.params.taskId,
          ...request.body
        });
        eventBus.publish("task.bid", bid);
        response.status(201).json({ bid });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        response.status(400).json({ error: message });
      }
    }
  );

  router.post(
    "/:taskId/bids/:bidId/accept",
    validateBody(acceptBidSchema),
    async (request, response) => {
      try {
        const result = await acceptBid({
          taskId: request.params.taskId,
          bidId: request.params.bidId,
          ...request.body
        });
        eventBus.publish("task.assigned", result);
        response.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        response.status(400).json({ error: message });
      }
    }
  );

  router.post(
    "/:taskId/submit",
    validateBody(submitWorkSchema),
    async (request, response) => {
      try {
        const submission = await submitWork({
          taskId: request.params.taskId,
          ...request.body
        });
        eventBus.publish("task.submitted", submission);
        response.status(201).json({ submission });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        response.status(400).json({ error: message });
      }
    }
  );

  router.post(
    "/:taskId/approve",
    validateBody(approveWorkSchema),
    async (request, response) => {
      try {
        const task = await approveWork({
          taskId: request.params.taskId,
          ...request.body
        });
        eventBus.publish("task.completed", task);
        response.json({ task });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        response.status(400).json({ error: message });
      }
    }
  );

  router.post(
    "/:taskId/dispute",
    validateBody(disputeWorkSchema),
    async (request, response) => {
      try {
        const task = await disputeWork({
          taskId: request.params.taskId,
          ...request.body
        });
        eventBus.publish("task.disputed", task);
        response.json({ task });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        response.status(400).json({ error: message });
      }
    }
  );

  router.post(
    "/:taskId/cancel",
    validateBody(cancelTaskSchema),
    async (request, response) => {
      try {
        const task = await cancelTask({
          taskId: request.params.taskId,
          ...request.body
        });
        eventBus.publish("task.cancelled", task);
        response.json({ task });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        response.status(400).json({ error: message });
      }
    }
  );

  return router;
}
