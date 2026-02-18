export {
  createApiServer,
  type ApiAgentPlatformOptions,
  type ApiAutonomyOptions,
  type ApiClawdbotOptions,
  type ApiMarketLifecycleOptions,
  type ApiServer,
  type CreateApiServerOptions
} from "./server.js";

export {
  createAgentAuthService,
  AgentAuthError,
  AgentAuthService,
  type AgentAuthServiceOptions
} from "./agent-platform/auth.js";

export {
  createAgentFaucetService,
  AgentFaucetError,
  AgentFaucetService,
  type AgentFaucetServiceOptions,
  type FaucetRefillResult
} from "./agent-platform/faucet.js";

export {
  createAgentPlatformStore,
  getAgentPlatformStore,
  persistAgentPlatformStore,
  resetAgentPlatformStoreForTests
} from "./agent-platform/store.js";

export { EncryptedAgentWalletStore, AgentWalletStoreError } from "./agent-platform/wallet-store.js";

export type {
  AgentChallengeRecord,
  AgentFaucetAgentLedger,
  AgentFaucetLedger,
  AgentJwtClaims,
  AgentPlatformStore,
  AgentPlatformOptions,
  AgentProfileRecord,
  AgentRequestContext,
  AgentStatus,
  AgentWalletCredentials,
  AgentWalletPrivateKeyType,
  AgentWalletRecord,
  EncryptedValue
} from "./agent-platform/types.js";

export {
  createAutonomyEngine,
  type AutonomyChallengeInput,
  type AutonomyEngine,
  type AutonomyEngineOptions,
  type AutonomyStatus
} from "./autonomy/engine.js";

export {
  createClawdbotNetwork,
  type ClawdbotProfile,
  type ClawdbotMessage,
  type ClawdbotNetwork,
  type ClawdbotNetworkOptions,
  type ClawdbotNetworkStatus,
  type CreateClawdbotEventMarketInput,
  type JoinClawdbotInput,
  type PlaceClawdbotBetInput,
  type ResolveClawdbotMarketInput
} from "./clawdbots/network.js";

export {
  createEventBus,
  type ApiEvent,
  type ApiEventBus,
  type ApiEventListener
} from "./events.js";

export { createAuthMiddleware, type AuthMiddlewareOptions } from "./middleware/auth.js";
export {
  createAutonomyMutationGuard,
  type AutonomyMutationGuardOptions
} from "./middleware/autonomy-guard.js";
export {
  createAgentAuthMiddleware,
  createAgentOnlyModeGuard,
  type AgentAuthMiddlewareOptions
} from "./middleware/agent-auth.js";

export { validateBody } from "./middleware/validation.js";
