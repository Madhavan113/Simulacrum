import { randomUUID } from "node:crypto";

import { getMessages, submitMessage, validateNonEmptyString, validatePositiveNumber } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";

import { getMarketStore, persistMarketStore, type MarketStore } from "./store.js";
import {
  MarketError,
  type Market,
  type MarketOrder,
  type OrderBookSnapshot,
  type OrderFill,
  type PublishOrderInput
} from "./types.js";

interface OrderBookDependencies {
  submitMessage: typeof submitMessage;
  getMessages: typeof getMessages;
  now: () => Date;
}

export interface PublishOrderOptions {
  client?: Client;
  store?: MarketStore;
  deps?: Partial<OrderBookDependencies>;
}

export interface GetOrderBookOptions {
  client?: Client;
  store?: MarketStore;
  includeMirrorNode?: boolean;
  deps?: Partial<OrderBookDependencies>;
}

function parseMessage(message: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(message);

    if (typeof value === "object" && value !== null) {
      return value as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function toMarketError(message: string, error: unknown): MarketError {
  if (error instanceof MarketError) {
    return error;
  }

  return new MarketError(message, error);
}

function orderSortComparator(a: MarketOrder, b: MarketOrder): number {
  return Date.parse(a.createdAt) - Date.parse(b.createdAt);
}

/**
 * Compute mark price per outcome from the order book spread.
 * Returns mid-price (best_bid + best_ask) / 2 for each outcome that has both sides,
 * normalized so that percentages sum to 100 when all outcomes are covered.
 */
function computeClobMarkPrice(
  orders: MarketOrder[],
  outcomes: readonly string[]
): Record<string, number> | undefined {
  const markPrice: Record<string, number> = {};
  let covered = 0;

  for (const outcome of outcomes) {
    const bestBid = orders
      .filter((o) => o.outcome === outcome && o.side === "BID" && o.status === "OPEN")
      .reduce((best, o) => (o.price > best ? o.price : best), -Infinity);
    const bestAsk = orders
      .filter((o) => o.outcome === outcome && o.side === "ASK" && o.status === "OPEN")
      .reduce((best, o) => (o.price < best ? o.price : best), Infinity);

    if (Number.isFinite(bestBid) && Number.isFinite(bestAsk)) {
      markPrice[outcome] = (bestBid + bestAsk) / 2;
      covered++;
    }
  }

  if (covered === 0) {
    return undefined;
  }

  const total = Object.values(markPrice).reduce((sum, v) => sum + v, 0);
  if (total <= 0) {
    return undefined;
  }

  const odds: Record<string, number> = {};
  for (const outcome of outcomes) {
    if (markPrice[outcome] !== undefined) {
      odds[outcome] = Number(((markPrice[outcome] / total) * 100).toFixed(2));
    }
  }
  return odds;
}

/**
 * Update a market's currentOddsByOutcome from order book state after fills.
 * Tries mid-price first; falls back to last fill price for binary markets.
 */
function updateClobMarkPrice(
  market: Market,
  allOrders: MarketOrder[],
  fills: OrderFill[]
): void {
  const clobPrice = computeClobMarkPrice(allOrders, market.outcomes);

  if (clobPrice) {
    market.currentOddsByOutcome = clobPrice;
    market.markPriceSource = "CLOB_MID";
    return;
  }

  const lastFill = fills[fills.length - 1];
  if (!lastFill) {
    return;
  }

  const oddsByOutcome = { ...(market.currentOddsByOutcome ?? {}) };
  oddsByOutcome[lastFill.outcome] = Number((lastFill.price * 100).toFixed(2));

  if (market.outcomes.length === 2) {
    const other = market.outcomes.find((o) => o !== lastFill.outcome);
    if (other) {
      oddsByOutcome[other] = Number((100 - oddsByOutcome[lastFill.outcome]).toFixed(2));
    }
  }

  market.currentOddsByOutcome = oddsByOutcome;
  market.markPriceSource = "CLOB_LAST_FILL";
}

async function loadOrdersFromMirrorNode(
  marketId: string,
  options: GetOrderBookOptions,
  deps: OrderBookDependencies
): Promise<MarketOrder[]> {
  const { messages } = await deps.getMessages(marketId, { client: options.client, order: "asc" });

  const orders = new Map<string, MarketOrder>();

  for (const message of messages) {
    const payload = parseMessage(message.message);

    if (!payload || payload.marketId !== marketId) {
      continue;
    }

    if (payload.type === "ORDER_PLACED") {
      const order: MarketOrder = {
        id: String(payload.orderId),
        marketId,
        accountId: String(payload.accountId),
        outcome: String(payload.outcome),
        side: String(payload.side) === "ASK" ? "ASK" : "BID",
        quantity: Number(payload.quantity),
        price: Number(payload.price),
        createdAt: String(payload.createdAt),
        status: "OPEN",
        topicSequenceNumber: message.sequenceNumber
      };

      if (order.quantity > 0 && order.price > 0) {
        orders.set(order.id, order);
      }
    }

    if (payload.type === "ORDER_CANCELLED") {
      const orderId = String(payload.orderId);
      const existing = orders.get(orderId);

      if (existing) {
        existing.status = "CANCELLED";
      }
    }
  }

  return Array.from(orders.values()).sort(orderSortComparator);
}

export async function publishOrder(
  input: PublishOrderInput,
  options: PublishOrderOptions = {}
): Promise<MarketOrder> {
  validateNonEmptyString(input.marketId, "marketId");
  validateNonEmptyString(input.accountId, "accountId");
  validateNonEmptyString(input.outcome, "outcome");
  validatePositiveNumber(input.quantity, "quantity");
  validatePositiveNumber(input.price, "price");

  if (input.side !== "BID" && input.side !== "ASK") {
    throw new MarketError("side must be BID or ASK.");
  }

  const store = getMarketStore(options.store);
  const market = store.markets.get(input.marketId);

  if (!market) {
    throw new MarketError(`Market ${input.marketId} was not found.`);
  }

  if (market.status !== "OPEN") {
    throw new MarketError(`Market ${input.marketId} is not open for orders.`);
  }

  if (input.price > 1) {
    throw new MarketError(`Order price ${input.price} exceeds maximum of 1.0 for a probability market.`);
  }

  const normalizedOutcome = input.outcome.trim().toUpperCase();

  if (!market.outcomes.includes(normalizedOutcome)) {
    throw new MarketError(
      `Invalid outcome "${input.outcome}". Supported outcomes: ${market.outcomes.join(", ")}.`
    );
  }

  const deps: OrderBookDependencies = {
    submitMessage,
    getMessages,
    now: () => new Date(),
    ...options.deps
  };

  try {
    const createdAt = deps.now().toISOString();
    const orderId = randomUUID();
    const audit = await deps.submitMessage(
      market.topicId,
      {
        type: "ORDER_PLACED",
        marketId: market.id,
        orderId,
        accountId: input.accountId,
        outcome: normalizedOutcome,
        side: input.side,
        quantity: input.quantity,
        price: input.price,
        createdAt
      },
      { client: options.client }
    );

    const order: MarketOrder = {
      id: orderId,
      marketId: market.id,
      accountId: input.accountId,
      outcome: normalizedOutcome,
      side: input.side,
      quantity: input.quantity,
      price: input.price,
      createdAt,
      status: "OPEN",
      topicTransactionId: audit.transactionId,
      topicTransactionUrl: audit.transactionUrl,
      topicSequenceNumber: audit.sequenceNumber
    };

    const orders = store.orders.get(market.id) ?? [];
    orders.push(order);
    store.orders.set(market.id, orders);
    persistMarketStore(store);

    await matchOrdersForMarket(market.id, normalizedOutcome, options);

    return order;
  } catch (error) {
    throw toMarketError(`Failed to publish order for market ${input.marketId}.`, error);
  }
}

export async function cancelOrder(
  marketId: string,
  orderId: string,
  accountId: string,
  options: PublishOrderOptions = {}
): Promise<MarketOrder> {
  validateNonEmptyString(marketId, "marketId");
  validateNonEmptyString(orderId, "orderId");
  validateNonEmptyString(accountId, "accountId");

  const store = getMarketStore(options.store);
  const orders = store.orders.get(marketId) ?? [];
  const order = orders.find((candidate) => candidate.id === orderId);

  if (!order) {
    throw new MarketError(`Order ${orderId} was not found for market ${marketId}.`);
  }

  if (order.accountId !== accountId) {
    throw new MarketError(`Order ${orderId} can only be cancelled by its owner.`);
  }

  if (order.status === "CANCELLED") {
    return order;
  }

  const deps: OrderBookDependencies = {
    submitMessage,
    getMessages,
    now: () => new Date(),
    ...options.deps
  };

  const audit = await deps.submitMessage(
    marketId,
    {
      type: "ORDER_CANCELLED",
      marketId,
      orderId,
      accountId,
      cancelledAt: deps.now().toISOString()
    },
    { client: options.client }
  );

  order.status = "CANCELLED";
  order.topicTransactionId = audit.transactionId;
  order.topicTransactionUrl = audit.transactionUrl;
  order.topicSequenceNumber = audit.sequenceNumber;
  persistMarketStore(store);

  return order;
}

async function matchOrdersForMarket(
  marketId: string,
  outcome: string,
  options: PublishOrderOptions = {}
): Promise<OrderFill[]> {
  const store = getMarketStore(options.store);
  const orders = store.orders.get(marketId) ?? [];

  const openBids = orders
    .filter((o) => o.outcome === outcome && o.side === "BID" && o.status === "OPEN")
    .sort((a, b) => b.price - a.price || Date.parse(a.createdAt) - Date.parse(b.createdAt));

  const openAsks = orders
    .filter((o) => o.outcome === outcome && o.side === "ASK" && o.status === "OPEN")
    .sort((a, b) => a.price - b.price || Date.parse(a.createdAt) - Date.parse(b.createdAt));

  const fills: OrderFill[] = [];
  let bidIdx = 0;
  let askIdx = 0;

  const deps: OrderBookDependencies = {
    submitMessage,
    getMessages,
    now: () => new Date(),
    ...options.deps
  };

  while (bidIdx < openBids.length && askIdx < openAsks.length) {
    const bid = openBids[bidIdx];
    const ask = openAsks[askIdx];

    if (!bid || !ask || bid.price < ask.price) {
      break;
    }

    if (bid.accountId === ask.accountId) {
      askIdx++;
      continue;
    }

    const remainingBid = bid.quantity - (bid.filledQuantity ?? 0);
    const remainingAsk = ask.quantity - (ask.filledQuantity ?? 0);
    const fillQty = Math.min(remainingBid, remainingAsk);

    if (fillQty <= 0) {
      if (remainingBid <= 0) bidIdx++;
      if (remainingAsk <= 0) askIdx++;
      continue;
    }

    const fillPrice = ask.price;
    const fill: OrderFill = {
      id: randomUUID(),
      marketId,
      outcome,
      bidOrderId: bid.id,
      askOrderId: ask.id,
      bidAccountId: bid.accountId,
      askAccountId: ask.accountId,
      price: fillPrice,
      quantity: fillQty,
      createdAt: deps.now().toISOString()
    };

    bid.filledQuantity = (bid.filledQuantity ?? 0) + fillQty;
    ask.filledQuantity = (ask.filledQuantity ?? 0) + fillQty;

    if (bid.filledQuantity >= bid.quantity) {
      bid.status = "FILLED";
      bidIdx++;
    }
    if (ask.filledQuantity >= ask.quantity) {
      ask.status = "FILLED";
      askIdx++;
    }

    fills.push(fill);

    try {
      await deps.submitMessage(
        marketId,
        {
          type: "ORDER_FILLED",
          ...fill
        },
        { client: options.client }
      );
    } catch {
      // Fill is recorded locally even if HCS audit fails
    }
  }

  if (fills.length > 0) {
    const market = store.markets.get(marketId);
    if (market) {
      const allOrders = store.orders.get(marketId) ?? [];
      updateClobMarkPrice(market, allOrders, fills);
    }
    persistMarketStore(store);
  }

  return fills;
}

export async function getOrderBook(
  marketId: string,
  options: GetOrderBookOptions = {}
): Promise<OrderBookSnapshot> {
  validateNonEmptyString(marketId, "marketId");

  const store = getMarketStore(options.store);

  if (!store.markets.has(marketId)) {
    throw new MarketError(`Market ${marketId} was not found.`);
  }

  const deps: OrderBookDependencies = {
    submitMessage,
    getMessages,
    now: () => new Date(),
    ...options.deps
  };

  const market = store.markets.get(marketId)!;
  const localOrders = store.orders.get(marketId) ?? [];
  const mirrorOrders = options.includeMirrorNode
    ? await loadOrdersFromMirrorNode(marketId, options, deps)
    : [];

  const merged = [...localOrders, ...mirrorOrders]
    .reduce((map, order) => {
      map.set(order.id, order);
      return map;
    }, new Map<string, MarketOrder>());

  const orders = Array.from(merged.values()).sort(orderSortComparator);

  return {
    marketId,
    orders,
    bids: orders.filter((order) => order.side === "BID" && order.status === "OPEN"),
    asks: orders.filter((order) => order.side === "ASK" && order.status === "OPEN"),
    markPrice: computeClobMarkPrice(orders, market.outcomes)
  };
}
