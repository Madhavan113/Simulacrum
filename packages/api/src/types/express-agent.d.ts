import type { AgentRequestContext } from "../agent-platform/types.js";

declare global {
  namespace Express {
    interface Request {
      agentContext?: AgentRequestContext;
    }
  }
}

export {};

