export {
  AgentError,
  BaseAgent,
  type AgentConfig,
  type AgentContext,
  type AgentMode,
  type AgentStrategy,
  type BetDecision,
  type MarketSnapshot
} from "./agent.js";

export {
  createRandomStrategy,
  type RandomStrategyOptions
} from "./strategies/random.js";

export {
  createReputationBasedStrategy,
  type ReputationStrategyOptions
} from "./strategies/reputation-based.js";

export {
  createContrarianStrategy,
  type ContrarianStrategyOptions
} from "./strategies/contrarian.js";

export {
  runMultiAgentSimulation,
  type SimulationOptions,
  type SimulationResult
} from "./simulation.js";

export {
  createOpenClawAdapter,
  OpenClawIntegrationError,
  type OpenClawAdapter,
  type OpenClawIntegrationHandlers,
  type OpenClawToolCall
} from "./openclaw.js";
