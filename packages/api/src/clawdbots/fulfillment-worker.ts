import { completeRequest } from "@simulacrum/services";
import { getServiceStore, persistServiceStore } from "@simulacrum/services";

import type { ApiEventBus } from "../events.js";
import type { ClawdbotNetwork } from "./network.js";

export interface FulfillmentJob {
  requestId: string;
  serviceId: string;
  providerAccountId: string;
  serviceName: string;
  serviceDescription: string;
  input: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  output?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

/**
 * Spawns LLM fulfillment as background "subagent" tasks instead of blocking
 * the caller. Payment and acceptance happen synchronously; only the LLM
 * generation runs in the background. Callers receive the request ID
 * immediately and can poll or listen via EventBus for completion.
 */
export class FulfillmentWorker {
  readonly #jobs = new Map<string, FulfillmentJob>();
  readonly #network: ClawdbotNetwork;
  readonly #eventBus: ApiEventBus;

  constructor(network: ClawdbotNetwork, eventBus: ApiEventBus) {
    this.#network = network;
    this.#eventBus = eventBus;
  }

  /**
   * Enqueue a fulfillment job that runs the provider bot's LLM in the
   * background. Returns immediately — the caller doesn't block on the LLM.
   */
  spawn(job: Omit<FulfillmentJob, "status" | "createdAt">): FulfillmentJob {
    const entry: FulfillmentJob = {
      ...job,
      status: "RUNNING",
      createdAt: new Date().toISOString(),
    };
    this.#jobs.set(job.requestId, entry);

    const store = getServiceStore();
    const request = store.requests.get(job.requestId);
    if (request && request.status === "ACCEPTED") {
      request.status = "IN_PROGRESS";
      store.requests.set(request.id, request);
      persistServiceStore(store);
    }

    this.#run(entry).catch((error) => {
      console.error(
        `[fulfillment-worker] unhandled error for request ${job.requestId}:`,
        error,
      );
    });

    return entry;
  }

  getJob(requestId: string): FulfillmentJob | undefined {
    return this.#jobs.get(requestId);
  }

  async #run(job: FulfillmentJob): Promise<void> {
    try {
      const output = await this.#network.fulfillServiceRequest(
        job.providerAccountId,
        job.serviceName,
        job.serviceDescription,
        job.input,
      );

      await completeRequest({
        serviceId: job.serviceId,
        requestId: job.requestId,
        providerAccountId: job.providerAccountId,
        output,
      });

      job.status = "COMPLETED";
      job.output = output;
      job.completedAt = new Date().toISOString();

      this.#eventBus.publish("service.fulfilled", {
        requestId: job.requestId,
        serviceId: job.serviceId,
        providerAccountId: job.providerAccountId,
        serviceName: job.serviceName,
        output: output.slice(0, 500),
      });
    } catch (error) {
      job.status = "FAILED";
      job.error = error instanceof Error ? error.message : String(error);
      job.completedAt = new Date().toISOString();

      this.#eventBus.publish("service.fulfillment_failed", {
        requestId: job.requestId,
        serviceId: job.serviceId,
        error: job.error,
      });
    }
  }
}
