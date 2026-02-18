import { resetCoordinationStoreForTests } from "@simulacrum/coordination";
import { resetHederaClientForTests } from "@simulacrum/core";
import { resetInsuranceStoreForTests } from "@simulacrum/insurance";
import { resetMarketStoreForTests } from "@simulacrum/markets";
import { resetReputationStoreForTests } from "@simulacrum/reputation";

import { isExecutedDirectly, logStep } from "./utils.js";

export function resetAllBackendState(): void {
  resetHederaClientForTests();
  resetMarketStoreForTests();
  resetReputationStoreForTests();
  resetInsuranceStoreForTests();
  resetCoordinationStoreForTests();
}

if (isExecutedDirectly(import.meta.url)) {
  logStep("Resetting backend in-memory state");
  resetAllBackendState();
  logStep("Reset complete");
}
