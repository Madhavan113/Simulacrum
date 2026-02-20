import { randomUUID } from "node:crypto";
import type { ObservationWindow, ResearchObservation, ObservationCategory } from "@simulacrum/types";
import { createWindow } from "./observation-window.js";

const MAX_BUFFER_SIZE = 10_000;

interface EventBusLike {
  subscribe: (listener: (event: { type: string; payload: unknown; timestamp: string }) => void) => () => void;
}

interface MarketStoreLike {
  markets: Map<string, { id: string; question: string; creatorAccountId: string; outcomes: string[]; status: string; createdAt: string }>;
  bets: Map<string, Array<{ id: string; marketId: string; bettorAccountId: string; outcome: string; amountHbar: number; placedAt: string }>>;
  orders: Map<string, Array<{ id: string; marketId: string; accountId: string; side: string; price: number; quantity: number; createdAt: string }>>;
}

interface ReputationStoreLike {
  attestations: Array<{
    id: string;
    attesterAccountId: string;
    subjectAccountId: string;
    scoreDelta: number;
    confidence: number;
    createdAt: string;
  }>;
}

function categorizeEvent(type: string): ObservationCategory | null {
  if (type === "market.created" || type === "autonomy.market.created" || type === "clawdbot.market.created") {
    return "market_creation";
  }
  if (type === "market.bet" || type === "autonomy.bet.placed" || type === "clawdbot.bet.placed" || type === "clawdbot.bet.external") {
    return "price_movement";
  }
  if (type === "market.order" || type === "clawdbot.order.placed") {
    return "liquidity_event";
  }
  if (type === "market.challenged" || type === "clawdbot.market.challenged" || type === "market.oracle_vote") {
    return "dispute_resolution";
  }
  if (type === "reputation.attested") {
    return "reputation_change";
  }
  if (type === "clawdbot.goal.created" || type === "clawdbot.goal.completed") {
    return "agent_strategy";
  }
  if (type === "autonomy.agent.created" || type === "clawdbot.spawned" || type === "clawdbot.joined") {
    return "coordination_signal";
  }
  return null;
}

function extractMetrics(type: string, payload: Record<string, unknown>): Record<string, number> {
  const metrics: Record<string, number> = {};

  if (typeof payload.amountHbar === "number") metrics.amountHbar = payload.amountHbar;
  if (typeof payload.quantity === "number") metrics.quantity = payload.quantity;
  if (typeof payload.price === "number") metrics.price = payload.price;
  if (typeof payload.confidence === "number") metrics.confidence = payload.confidence;
  if (typeof payload.scoreDelta === "number") metrics.scoreDelta = payload.scoreDelta;

  if (type.includes("bet") && typeof payload.amountHbar === "number") {
    metrics.betSize = payload.amountHbar;
  }

  return metrics;
}

function extractAgentIds(payload: Record<string, unknown>): string[] {
  const ids: string[] = [];
  if (typeof payload.agentId === "string") ids.push(payload.agentId);
  if (typeof payload.botId === "string") ids.push(payload.botId);
  if (typeof payload.accountId === "string") ids.push(payload.accountId);
  if (typeof payload.bettorAccountId === "string") ids.push(payload.bettorAccountId);
  if (typeof payload.challengerAccountId === "string") ids.push(payload.challengerAccountId);
  if (typeof payload.voterAccountId === "string") ids.push(payload.voterAccountId);
  if (typeof payload.attesterAccountId === "string") ids.push(payload.attesterAccountId);
  if (typeof payload.subjectAccountId === "string") ids.push(payload.subjectAccountId);
  return [...new Set(ids)];
}

export class DataCollector {
  readonly #buffer: ResearchObservation[] = [];
  readonly #sealedWindows: ObservationWindow[] = [];
  #unsubscribe: (() => void) | null = null;
  readonly #maxBufferSize: number;
  readonly #maxSealedWindows: number;

  constructor(options?: { maxBufferSize?: number; maxSealedWindows?: number }) {
    this.#maxBufferSize = options?.maxBufferSize ?? MAX_BUFFER_SIZE;
    this.#maxSealedWindows = options?.maxSealedWindows ?? 100;
  }

  get bufferSize(): number {
    return this.#buffer.length;
  }

  get sealedWindowCount(): number {
    return this.#sealedWindows.length;
  }

  subscribe(eventBus: EventBusLike): void {
    if (this.#unsubscribe) return;

    this.#unsubscribe = eventBus.subscribe((event) => {
      const category = categorizeEvent(event.type);
      if (!category) return;

      const payload = (event.payload ?? {}) as Record<string, unknown>;

      const observation: ResearchObservation = {
        id: randomUUID(),
        timestamp: event.timestamp,
        category,
        sourceEvent: event.type,
        marketId: typeof payload.marketId === "string" ? payload.marketId : undefined,
        agentIds: extractAgentIds(payload),
        metrics: extractMetrics(event.type, payload),
        context: payload,
      };

      this.#pushObservation(observation);
    });
  }

  unsubscribe(): void {
    if (this.#unsubscribe) {
      this.#unsubscribe();
      this.#unsubscribe = null;
    }
  }

  sortBuffer(): void {
    this.#buffer.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  hydrateFromMarketStore(store: MarketStoreLike): void {
    for (const [, market] of store.markets) {
      this.#pushObservation({
        id: randomUUID(),
        timestamp: market.createdAt,
        category: "market_creation",
        sourceEvent: "hydration.market",
        marketId: market.id,
        agentIds: [market.creatorAccountId],
        metrics: { outcomeCount: market.outcomes.length },
        context: { question: market.question, status: market.status },
      });
    }

    for (const [marketId, bets] of store.bets) {
      for (const bet of bets) {
        this.#pushObservation({
          id: randomUUID(),
          timestamp: bet.placedAt,
          category: "price_movement",
          sourceEvent: "hydration.bet",
          marketId,
          agentIds: [bet.bettorAccountId],
          metrics: { amountHbar: bet.amountHbar, betSize: bet.amountHbar },
          context: { outcome: bet.outcome },
        });
      }
    }

    for (const [marketId, orders] of store.orders) {
      for (const order of orders) {
        this.#pushObservation({
          id: randomUUID(),
          timestamp: order.createdAt,
          category: "liquidity_event",
          sourceEvent: "hydration.order",
          marketId,
          agentIds: [order.accountId],
          metrics: { price: order.price, quantity: order.quantity },
          context: { side: order.side },
        });
      }
    }
  }

  hydrateFromReputationStore(store: ReputationStoreLike): void {
    for (const att of store.attestations) {
      this.#pushObservation({
        id: randomUUID(),
        timestamp: att.createdAt,
        category: "reputation_change",
        sourceEvent: "hydration.attestation",
        agentIds: [att.attesterAccountId, att.subjectAccountId],
        metrics: { scoreDelta: att.scoreDelta, confidence: att.confidence },
        context: {},
      });
    }
  }

  flush(): ObservationWindow {
    const window = createWindow([...this.#buffer]);
    this.#sealedWindows.push(window);

    if (this.#sealedWindows.length > this.#maxSealedWindows) {
      this.#sealedWindows.splice(0, this.#sealedWindows.length - this.#maxSealedWindows);
    }

    this.#buffer.length = 0;
    return window;
  }

  currentObservations(): ResearchObservation[] {
    return [...this.#buffer];
  }

  recentWindows(count: number): ObservationWindow[] {
    return this.#sealedWindows.slice(-count);
  }

  allObservations(): ResearchObservation[] {
    const sealed = this.#sealedWindows.flatMap((w) => w.observations);
    return [...sealed, ...this.#buffer];
  }

  observationsForMarket(marketId: string): ResearchObservation[] {
    return this.allObservations().filter((o) => o.marketId === marketId);
  }

  observationsForAgent(agentId: string): ResearchObservation[] {
    return this.allObservations().filter((o) => o.agentIds.includes(agentId));
  }

  #pushObservation(observation: ResearchObservation): void {
    this.#buffer.push(observation);
    if (this.#buffer.length > this.#maxBufferSize) {
      this.#buffer.splice(0, this.#buffer.length - this.#maxBufferSize);
    }
  }
}
