import {
  Client,
  PrivateKey,
  PublicKey,
  TopicCreateTransaction,
  TopicId,
  TopicMessageSubmitTransaction
} from "@hashgraph/sdk";

import { type HederaNetwork } from "./client.js";
import {
  buildTopicUrl,
  buildTransactionUrl,
  resolveClient,
  resolveNetwork
} from "./hedera-utils.js";
import { validateNonEmptyString, validateNonNegativeInteger, validatePositiveInteger } from "./validation.js";
const DEFAULT_POLLING_INTERVAL_MS = 3_000;

const MIRROR_NODE_BASE_URLS: Record<HederaNetwork, string> = {
  testnet: "https://testnet.mirrornode.hedera.com",
  mainnet: "https://mainnet-public.mirrornode.hedera.com",
  previewnet: "https://previewnet.mirrornode.hedera.com"
};

export type TopicMessageInput = string | Uint8Array | Record<string, unknown>;

export interface TopicOperationResult {
  topicId: string;
  topicUrl: string;
  transactionId: string;
  transactionUrl: string;
}

export interface TopicMessageSubmitResult extends TopicOperationResult {
  sequenceNumber?: number;
}

export interface TopicMessage {
  sequenceNumber: number;
  consensusTimestamp: string;
  message: string;
  payerAccountId?: string;
  runningHash?: string;
}

export interface GetTopicMessagesResult {
  messages: TopicMessage[];
  nextLink: string | null;
}

export interface HcsOperationOptions {
  client?: Client;
}

export interface MirrorNodeOptions extends HcsOperationOptions {
  fetchImpl?: typeof fetch;
  mirrorNodeBaseUrl?: string;
}

export interface GetTopicMessagesOptions extends MirrorNodeOptions {
  limit?: number;
  order?: "asc" | "desc";
  sequenceNumber?: number;
}

export interface SubscribeToTopicOptions extends MirrorNodeOptions {
  intervalMs?: number;
  startSequenceNumber?: number;
  limit?: number;
  order?: "asc" | "desc";
  onError?: (error: HederaTopicError) => void;
  signal?: AbortSignal;
}

export interface TopicSubscription {
  stop: () => void;
}

interface MirrorNodeTopicMessage {
  consensus_timestamp: string;
  message: string;
  payer_account_id?: string;
  running_hash?: string;
  sequence_number: number;
}

interface MirrorNodeTopicMessagesResponse {
  messages?: MirrorNodeTopicMessage[];
  links?: {
    next?: string | null;
  };
}

export class HederaTopicError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "HederaTopicError";
  }
}

function resolveMirrorNodeBaseUrl(client: Client, mirrorNodeBaseUrl?: string): string {
  if (mirrorNodeBaseUrl) {
    return mirrorNodeBaseUrl.replace(/\/$/, "");
  }

  return MIRROR_NODE_BASE_URLS[resolveNetwork(client)];
}


function asHederaTopicError(message: string, error: unknown): HederaTopicError {
  if (error instanceof HederaTopicError) {
    return error;
  }

  return new HederaTopicError(message, error);
}


function parseSubmitKey(submitKey: string): PublicKey {
  try {
    return PrivateKey.fromString(submitKey).publicKey;
  } catch {
    return PublicKey.fromString(submitKey);
  }
}

function serializeMessage(message: TopicMessageInput): string | Uint8Array {
  if (typeof message === "string" || message instanceof Uint8Array) {
    return message;
  }

  return JSON.stringify(message);
}

function decodeMessage(base64EncodedMessage: string): string {
  try {
    return Buffer.from(base64EncodedMessage, "base64").toString("utf8");
  } catch {
    return base64EncodedMessage;
  }
}

function toTopicOperationResult(
  client: Client,
  topicId: string,
  transactionId: string
): TopicOperationResult {
  const network = resolveNetwork(client);

  return {
    topicId,
    topicUrl: buildTopicUrl(network, topicId),
    transactionId,
    transactionUrl: buildTransactionUrl(network, transactionId)
  };
}

function toSequenceNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toNumber" in value &&
    typeof (value as { toNumber: () => number }).toNumber === "function"
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }

  return undefined;
}

export async function createTopic(
  memo: string,
  submitKey?: string,
  options: HcsOperationOptions = {}
): Promise<TopicOperationResult> {
  validateNonEmptyString(memo, "memo");

  const client = resolveClient(options.client);

  try {
    const safeMemo = Buffer.byteLength(memo, "utf-8") > 100
      ? memo.slice(0, 97) + "..."
      : memo;
    const transaction = new TopicCreateTransaction().setTopicMemo(safeMemo);

    if (submitKey) {
      transaction.setSubmitKey(parseSubmitKey(submitKey));
    }

    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);
    const topicId = receipt.topicId?.toString();

    if (!topicId) {
      throw new HederaTopicError("Topic creation completed without a topic ID in the receipt.");
    }

    return toTopicOperationResult(client, topicId, response.transactionId.toString());
  } catch (error) {
    throw asHederaTopicError("Failed to create topic.", error);
  }
}

export async function submitMessage(
  topicId: string,
  message: TopicMessageInput,
  options: HcsOperationOptions = {}
): Promise<TopicMessageSubmitResult> {
  validateNonEmptyString(topicId, "topicId");

  const client = resolveClient(options.client);

  try {
    const response = await new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(topicId))
      .setMessage(serializeMessage(message))
      .execute(client);

    const receipt = await response.getReceipt(client);
    const result = toTopicOperationResult(client, topicId, response.transactionId.toString());

    return {
      ...result,
      sequenceNumber: toSequenceNumber(receipt.topicSequenceNumber)
    };
  } catch (error) {
    throw asHederaTopicError("Failed to submit topic message.", error);
  }
}

export async function getMessages(
  topicId: string,
  options: GetTopicMessagesOptions = {}
): Promise<GetTopicMessagesResult> {
  validateNonEmptyString(topicId, "topicId");

  if (options.limit !== undefined) {
    validatePositiveInteger(options.limit, "limit");
  }

  if (options.sequenceNumber !== undefined) {
    validateNonNegativeInteger(options.sequenceNumber, "sequenceNumber");
  }

  const client = resolveClient(options.client);
  const mirrorNodeBaseUrl = resolveMirrorNodeBaseUrl(client, options.mirrorNodeBaseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const searchParams = new URLSearchParams();

    if (options.limit !== undefined) {
      searchParams.set("limit", String(options.limit));
    }

    if (options.order) {
      searchParams.set("order", options.order);
    }

    if (options.sequenceNumber !== undefined) {
      searchParams.set("sequencenumber", `gt:${options.sequenceNumber}`);
    }

    const query = searchParams.toString();
    const requestUrl = `${mirrorNodeBaseUrl}/api/v1/topics/${encodeURIComponent(topicId)}/messages${
      query ? `?${query}` : ""
    }`;
    const response = await fetchImpl(requestUrl);

    if (!response.ok) {
      throw new HederaTopicError(
        `Mirror Node request failed with HTTP ${response.status} for topic ${topicId}.`
      );
    }

    const responseBody = (await response.json()) as MirrorNodeTopicMessagesResponse;
    const messages = (responseBody.messages ?? []).map((message) => ({
      sequenceNumber: message.sequence_number,
      consensusTimestamp: message.consensus_timestamp,
      message: decodeMessage(message.message),
      payerAccountId: message.payer_account_id,
      runningHash: message.running_hash
    }));

    return {
      messages,
      nextLink: responseBody.links?.next ?? null
    };
  } catch (error) {
    throw asHederaTopicError("Failed to fetch topic messages.", error);
  }
}

export function subscribeToTopic(
  topicId: string,
  callback: (message: TopicMessage) => void,
  options: SubscribeToTopicOptions = {}
): TopicSubscription {
  validateNonEmptyString(topicId, "topicId");

  const intervalMs = options.intervalMs ?? DEFAULT_POLLING_INTERVAL_MS;
  validatePositiveInteger(intervalMs, "intervalMs");

  let active = true;
  let polling = false;
  let nextSequenceNumber = options.startSequenceNumber ?? 0;

  const pollOptions: Omit<GetTopicMessagesOptions, "sequenceNumber"> = {
    client: options.client,
    fetchImpl: options.fetchImpl,
    mirrorNodeBaseUrl: options.mirrorNodeBaseUrl,
    limit: options.limit,
    order: options.order
  };

  const poll = async (): Promise<void> => {
    if (!active || polling) {
      return;
    }

    polling = true;

    try {
      const { messages } = await getMessages(topicId, {
        ...pollOptions,
        sequenceNumber: nextSequenceNumber
      });

      for (const message of messages) {
        nextSequenceNumber = Math.max(nextSequenceNumber, message.sequenceNumber + 1);
        try {
          callback(message);
        } catch (error) {
          options.onError?.(asHederaTopicError("Subscription callback threw an error.", error));
        }
      }
    } catch (error) {
      options.onError?.(asHederaTopicError("Failed while polling subscribed topic.", error));
    } finally {
      polling = false;
    }
  };

  const intervalId = setInterval(() => {
    void poll();
  }, intervalMs);

  const stop = (): void => {
    if (!active) {
      return;
    }

    active = false;
    clearInterval(intervalId);

    if (options.signal) {
      options.signal.removeEventListener("abort", stop);
    }
  };

  if (options.signal) {
    if (options.signal.aborted) {
      stop();
    } else {
      options.signal.addEventListener("abort", stop);
    }
  }

  void poll();

  return { stop };
}
