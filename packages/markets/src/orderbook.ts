import { randomUUID } from "node:crypto";

import { getMessages, submitMessage } from "@simulacrum/core";
import type { Client } from "@hashgraph/sdk";

import { getMarketStore, persistMarketStore, type MarketStore } from "./store.js";
import {
  MarketError,
  type MarketOrder,
  type OrderBookSnapshot,
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

function validateNonEmptyString(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new MarketError(`${field} must be a non-empty string.`);
  }
}

function validatePositiveNumber(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new MarketError(`${field} must be a positive number.`);
  }
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
    asks: orders.filter((order) => order.side === "ASK" && order.status === "OPEN")
  };
}
