import { Router } from "express";

import { UCP_VERSION } from "./types.js";
import type { UcpDiscoveryProfile } from "./types.js";

export interface UcpDiscoveryOptions {
  hederaNetwork?: string;
  hederaAccountId?: string;
}

function buildProfile(
  endpoint: string,
  network: string,
  accountId: string
): UcpDiscoveryProfile {
  return {
    ucp: {
      version: UCP_VERSION,
      services: {
        "dev.simulacrum.markets": {
          version: UCP_VERSION,
          spec: "https://simulacrum.dev/specs/markets",
          rest: { schema: "https://simulacrum.dev/services/markets/openapi.json", endpoint },
          a2a: null,
          mcp: null
        },
        "dev.simulacrum.reputation": {
          version: UCP_VERSION,
          spec: "https://simulacrum.dev/specs/reputation",
          rest: { schema: "https://simulacrum.dev/services/reputation/openapi.json", endpoint },
          a2a: null,
          mcp: null
        },
        "dev.simulacrum.insurance": {
          version: UCP_VERSION,
          spec: "https://simulacrum.dev/specs/insurance",
          rest: { schema: "https://simulacrum.dev/services/insurance/openapi.json", endpoint },
          a2a: null,
          mcp: null
        },
        "dev.simulacrum.coordination": {
          version: UCP_VERSION,
          spec: "https://simulacrum.dev/specs/coordination",
          rest: { schema: "https://simulacrum.dev/services/coordination/openapi.json", endpoint },
          a2a: null,
          mcp: null
        },
        "dev.simulacrum.services": {
          version: UCP_VERSION,
          spec: "https://simulacrum.dev/specs/services",
          rest: { schema: "https://simulacrum.dev/services/services/openapi.json", endpoint },
          a2a: null,
          mcp: null
        },
        "dev.simulacrum.tasks": {
          version: UCP_VERSION,
          spec: "https://simulacrum.dev/specs/tasks",
          rest: { schema: "https://simulacrum.dev/services/tasks/openapi.json", endpoint },
          a2a: null,
          mcp: null
        }
      },
      capabilities: [
        { name: "dev.simulacrum.markets.predict", version: UCP_VERSION, spec: "https://simulacrum.dev/specs/markets/predict", schema: "https://simulacrum.dev/schemas/markets/predict.json" },
        { name: "dev.simulacrum.markets.orderbook", version: UCP_VERSION, spec: "https://simulacrum.dev/specs/markets/orderbook", schema: "https://simulacrum.dev/schemas/markets/orderbook.json", extends: "dev.simulacrum.markets.predict" },
        { name: "dev.simulacrum.markets.resolve", version: UCP_VERSION, spec: "https://simulacrum.dev/specs/markets/resolve", schema: "https://simulacrum.dev/schemas/markets/resolve.json", extends: "dev.simulacrum.markets.predict" },
        { name: "dev.simulacrum.markets.dispute", version: UCP_VERSION, spec: "https://simulacrum.dev/specs/markets/dispute", schema: "https://simulacrum.dev/schemas/markets/dispute.json", extends: "dev.simulacrum.markets.resolve" },
        { name: "dev.simulacrum.reputation.score", version: UCP_VERSION, spec: "https://simulacrum.dev/specs/reputation/score", schema: "https://simulacrum.dev/schemas/reputation/score.json" },
        { name: "dev.simulacrum.reputation.attest", version: UCP_VERSION, spec: "https://simulacrum.dev/specs/reputation/attest", schema: "https://simulacrum.dev/schemas/reputation/attest.json", extends: "dev.simulacrum.reputation.score" },
        { name: "dev.simulacrum.reputation.trust_graph", version: UCP_VERSION, spec: "https://simulacrum.dev/specs/reputation/trust-graph", schema: "https://simulacrum.dev/schemas/reputation/trust-graph.json", extends: "dev.simulacrum.reputation.score" },
        { name: "dev.simulacrum.insurance.underwrite", version: UCP_VERSION, spec: "https://simulacrum.dev/specs/insurance/underwrite", schema: "https://simulacrum.dev/schemas/insurance/underwrite.json" },
        { name: "dev.simulacrum.insurance.claim", version: UCP_VERSION, spec: "https://simulacrum.dev/specs/insurance/claim", schema: "https://simulacrum.dev/schemas/insurance/claim.json", extends: "dev.simulacrum.insurance.underwrite" },
        { name: "dev.simulacrum.coordination.assurance", version: UCP_VERSION, spec: "https://simulacrum.dev/specs/coordination/assurance", schema: "https://simulacrum.dev/schemas/coordination/assurance.json" },
        { name: "dev.simulacrum.coordination.schelling", version: UCP_VERSION, spec: "https://simulacrum.dev/specs/coordination/schelling", schema: "https://simulacrum.dev/schemas/coordination/schelling.json", extends: "dev.simulacrum.coordination.assurance" },
        { name: "dev.simulacrum.services.registry", version: UCP_VERSION, spec: "https://simulacrum.dev/specs/services/registry", schema: "https://simulacrum.dev/schemas/services/registry.json" },
        { name: "dev.simulacrum.services.invoke", version: UCP_VERSION, spec: "https://simulacrum.dev/specs/services/invoke", schema: "https://simulacrum.dev/schemas/services/invoke.json", extends: "dev.simulacrum.services.registry" },
        { name: "dev.simulacrum.services.review", version: UCP_VERSION, spec: "https://simulacrum.dev/specs/services/review", schema: "https://simulacrum.dev/schemas/services/review.json", extends: "dev.simulacrum.services.invoke" },
        { name: "dev.simulacrum.tasks.board", version: UCP_VERSION, spec: "https://simulacrum.dev/specs/tasks/board", schema: "https://simulacrum.dev/schemas/tasks/board.json" },
        { name: "dev.simulacrum.tasks.bid", version: UCP_VERSION, spec: "https://simulacrum.dev/specs/tasks/bid", schema: "https://simulacrum.dev/schemas/tasks/bid.json", extends: "dev.simulacrum.tasks.board" },
        { name: "dev.simulacrum.tasks.deliver", version: UCP_VERSION, spec: "https://simulacrum.dev/specs/tasks/deliver", schema: "https://simulacrum.dev/schemas/tasks/deliver.json", extends: "dev.simulacrum.tasks.bid" }
      ]
    },
    payment: {
      handlers: accountId
        ? [
            {
              id: "hedera_hbar",
              name: "com.hedera.hbar",
              version: UCP_VERSION,
              spec: "https://hedera.com/ucp/payment-handler",
              config_schema: "https://simulacrum.dev/ucp/handlers/hbar/config.json",
              instrument_schemas: ["https://simulacrum.dev/ucp/handlers/hbar/signed-transaction.json"],
              config: {
                network,
                merchant_account_id: accountId,
                supported_tokens: ["HBAR"],
                accepts_pre_signed: true
              }
            }
          ]
        : []
    },
    signing_keys: null
  };
}

export function createUcpDiscoveryRouter(
  options: UcpDiscoveryOptions = {}
): Router {
  const router = Router();

  const network =
    options.hederaNetwork ??
    process.env.HEDERA_NETWORK ??
    "testnet";
  const accountId =
    options.hederaAccountId ??
    process.env.HEDERA_ACCOUNT_ID ??
    "";

  router.get("/.well-known/ucp", (request, response) => {
    const baseUrl = `${request.protocol}://${request.get("host") ?? "localhost"}`;
    response.json(buildProfile(baseUrl, network, accountId));
  });

  return router;
}
