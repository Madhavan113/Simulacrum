import {
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction
} from "@hashgraph/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createHederaClient } from "./client.js";
import {
  HederaTopicError,
  createTopic,
  getMessages,
  submitMessage,
  subscribeToTopic
} from "./hcs.js";

function buildClient() {
  return createHederaClient({
    network: "testnet",
    accountId: "0.0.1001",
    privateKey: PrivateKey.generateED25519().toStringDer()
  });
}

function mockTransactionResponse(transactionId: string, receipt: Record<string, unknown>) {
  return {
    transactionId: { toString: () => transactionId },
    getReceipt: vi.fn().mockResolvedValue(receipt)
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createTopic", () => {
  it("returns topic and HashScan transaction URLs", async () => {
    vi.spyOn(TopicCreateTransaction.prototype, "execute").mockResolvedValue(
      mockTransactionResponse("0.0.1001@1700000000.000001", {
        topicId: { toString: () => "0.0.3001" }
      }) as never
    );

    const result = await createTopic("Simulacrum market events", undefined, {
      client: buildClient()
    });

    expect(result).toEqual({
      topicId: "0.0.3001",
      topicUrl: "https://hashscan.io/testnet/topic/0.0.3001",
      transactionId: "0.0.1001@1700000000.000001",
      transactionUrl:
        "https://hashscan.io/testnet/transaction/0.0.1001%401700000000.000001"
    });
  });
});

describe("submitMessage", () => {
  it("returns transaction/topic URLs and sequence number", async () => {
    vi.spyOn(TopicMessageSubmitTransaction.prototype, "execute").mockResolvedValue(
      mockTransactionResponse("0.0.1001@1700000000.000002", {
        topicSequenceNumber: { toNumber: () => 42 }
      }) as never
    );

    const result = await submitMessage("0.0.3001", { type: "BET", amount: 50 }, {
      client: buildClient()
    });

    expect(result).toEqual({
      topicId: "0.0.3001",
      topicUrl: "https://hashscan.io/testnet/topic/0.0.3001",
      transactionId: "0.0.1001@1700000000.000002",
      transactionUrl:
        "https://hashscan.io/testnet/transaction/0.0.1001%401700000000.000002",
      sequenceNumber: 42
    });
  });
});

describe("getMessages", () => {
  it("fetches and decodes Mirror Node messages", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        messages: [
          {
            sequence_number: 1,
            consensus_timestamp: "1700000000.000000001",
            message: Buffer.from("hello").toString("base64"),
            payer_account_id: "0.0.1001",
            running_hash: "abc123"
          }
        ],
        links: { next: null }
      })
    });

    const result = await getMessages("0.0.3001", {
      client: buildClient(),
      fetchImpl: fetchMock as unknown as typeof fetch,
      mirrorNodeBaseUrl: "https://testnet.mirrornode.hedera.com",
      limit: 10,
      order: "asc",
      sequenceNumber: 0
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain(
      "/api/v1/topics/0.0.3001/messages?limit=10&order=asc&sequencenumber=gt%3A0"
    );
    expect(result).toEqual({
      messages: [
        {
          sequenceNumber: 1,
          consensusTimestamp: "1700000000.000000001",
          message: "hello",
          payerAccountId: "0.0.1001",
          runningHash: "abc123"
        }
      ],
      nextLink: null
    });
  });

  it("throws a typed error when Mirror Node responds with non-200", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({})
    });

    await expect(
      getMessages("0.0.3001", {
        client: buildClient(),
        fetchImpl: fetchMock as unknown as typeof fetch,
        mirrorNodeBaseUrl: "https://testnet.mirrornode.hedera.com"
      })
    ).rejects.toThrow(HederaTopicError);
  });
});

describe("subscribeToTopic", () => {
  it("polls messages and invokes callback", async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          messages: [
            {
              sequence_number: 1,
              consensus_timestamp: "1700000000.000000001",
              message: Buffer.from("first").toString("base64")
            }
          ],
          links: { next: null }
        })
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ messages: [], links: { next: null } })
      });

    const callback = vi.fn();
    const subscription = subscribeToTopic("0.0.3001", callback, {
      client: buildClient(),
      fetchImpl: fetchMock as unknown as typeof fetch,
      mirrorNodeBaseUrl: "https://testnet.mirrornode.hedera.com",
      intervalMs: 1000
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        sequenceNumber: 1,
        message: "first"
      })
    );

    subscription.stop();
    const callCountAfterStop = fetchMock.mock.calls.length;

    await vi.advanceTimersByTimeAsync(3000);

    expect(fetchMock).toHaveBeenCalledTimes(callCountAfterStop);
  });
});
