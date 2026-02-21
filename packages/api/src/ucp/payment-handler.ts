import { Router } from "express";
import { z } from "zod";

import { transferHbar, getBalance } from "@simulacrum/core";

import type { ApiEventBus } from "../events.js";
import { validateBody } from "../middleware/validation.js";
import { UCP_VERSION } from "./types.js";
import type { UcpPaymentResult, UcpCapabilityResponse } from "./types.js";

const transferSchema = z.object({
  from_account_id: z.string().min(1),
  to_account_id: z.string().min(1),
  amount_hbar: z.number().positive(),
  memo: z.string().optional()
});

const balanceQuerySchema = z.object({
  account_id: z.string().min(1)
});

function ucpPaymentResponse<T>(
  operation: string,
  result: T,
  idempotencyKey?: string
): UcpCapabilityResponse<T> {
  return {
    ucp: {
      version: UCP_VERSION,
      capabilities: [
        { name: "com.hedera.hbar", version: UCP_VERSION }
      ]
    },
    id: crypto.randomUUID(),
    status: "ok",
    capability: "com.hedera.hbar",
    operation,
    result,
    idempotency_key: idempotencyKey,
    timestamp: new Date().toISOString()
  };
}

function ucpPaymentError(
  operation: string,
  code: string,
  message: string
): UcpCapabilityResponse {
  return {
    ucp: {
      version: UCP_VERSION,
      capabilities: [{ name: "com.hedera.hbar", version: UCP_VERSION }]
    },
    id: crypto.randomUUID(),
    status: "error",
    capability: "com.hedera.hbar",
    operation,
    error: { code, message },
    timestamp: new Date().toISOString()
  };
}

export interface UcpPaymentHandlerOptions {
  eventBus: ApiEventBus;
}

export function createUcpPaymentRouter(
  options: UcpPaymentHandlerOptions
): Router {
  const router = Router();

  router.post(
    "/transfer",
    validateBody(transferSchema),
    async (request, response) => {
      const idempotencyKey = request.get("idempotency-key");

      try {
        const result = await transferHbar(
          request.body.from_account_id,
          request.body.to_account_id,
          request.body.amount_hbar
        );

        const paymentResult: UcpPaymentResult = {
          transaction_id: result.transactionId,
          status: "SUCCESS",
          network: process.env.HEDERA_NETWORK ?? "testnet",
          explorer_url: result.transactionUrl,
          amount_hbar: request.body.amount_hbar
        };

        options.eventBus.publish("ucp.payment.completed", {
          ...paymentResult,
          from: request.body.from_account_id,
          to: request.body.to_account_id,
          memo: request.body.memo
        });

        response
          .status(201)
          .json(ucpPaymentResponse("transfer", paymentResult, idempotencyKey));
      } catch (error) {
        const paymentResult: UcpPaymentResult = {
          transaction_id: "",
          status: "FAILED",
          network: process.env.HEDERA_NETWORK ?? "testnet",
          explorer_url: "",
          amount_hbar: request.body.amount_hbar
        };

        options.eventBus.publish("ucp.payment.failed", {
          ...paymentResult,
          from: request.body.from_account_id,
          to: request.body.to_account_id,
          error: (error as Error).message
        });

        const errorBody = ucpPaymentError(
          "transfer", "TRANSFER_FAILED", (error as Error).message
        );
        errorBody.idempotency_key = idempotencyKey;
        response.status(400).json(errorBody);
      }
    }
  );

  router.get(
    "/balance/:account_id",
    async (request, response) => {
      const parsed = balanceQuerySchema.safeParse({ account_id: request.params.account_id });

      if (!parsed.success) {
        response.status(400).json(ucpPaymentError(
          "balance", "INVALID_ACCOUNT", "account_id path parameter is required"
        ));
        return;
      }

      try {
        const balance = await getBalance(parsed.data.account_id);

        response.json(
          ucpPaymentResponse("balance", {
            account_id: balance.accountId,
            hbar: balance.hbar,
            tinybar: balance.tinybar
          })
        );
      } catch (error) {
        response.status(400).json(ucpPaymentError(
          "balance", "BALANCE_FAILED", (error as Error).message
        ));
      }
    }
  );

  return router;
}
