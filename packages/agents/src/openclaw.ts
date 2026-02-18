import type { BaseAgent, MarketSnapshot } from "./agent.js";

export interface OpenClawToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface OpenClawIntegrationHandlers {
  createMarket?: (args: Record<string, unknown>) => Promise<unknown> | unknown;
  publishOrder?: (args: Record<string, unknown>) => Promise<unknown> | unknown;
  placeBet?: (args: Record<string, unknown>) => Promise<unknown> | unknown;
  resolveMarket?: (args: Record<string, unknown>) => Promise<unknown> | unknown;
  fetchMarkets?: () => Promise<MarketSnapshot[]> | MarketSnapshot[];
}

export interface OpenClawAdapter {
  agentId: string;
  availableTools: string[];
  handleToolCall: (call: OpenClawToolCall) => Promise<unknown>;
}

export class OpenClawIntegrationError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "OpenClawIntegrationError";
  }
}

export function createOpenClawAdapter(
  agent: BaseAgent,
  handlers: OpenClawIntegrationHandlers
): OpenClawAdapter {
  const map = new Map<string, (args: Record<string, unknown>) => Promise<unknown> | unknown>();

  if (handlers.createMarket) {
    map.set("create_market", handlers.createMarket);
  }

  if (handlers.placeBet) {
    map.set("place_bet", handlers.placeBet);
  }

  if (handlers.publishOrder) {
    map.set("publish_order", handlers.publishOrder);
  }

  if (handlers.resolveMarket) {
    map.set("resolve_market", handlers.resolveMarket);
  }

  if (handlers.fetchMarkets) {
    map.set("fetch_markets", () => handlers.fetchMarkets?.());
  }

  return {
    agentId: agent.id,
    availableTools: Array.from(map.keys()),
    async handleToolCall(call: OpenClawToolCall): Promise<unknown> {
      const handler = map.get(call.name);

      if (!handler) {
        throw new OpenClawIntegrationError(`Unsupported OpenClaw tool: ${call.name}`);
      }

      try {
        return await handler(call.args);
      } catch (error) {
        throw new OpenClawIntegrationError(`Failed handling OpenClaw tool ${call.name}.`, error);
      }
    }
  };
}
