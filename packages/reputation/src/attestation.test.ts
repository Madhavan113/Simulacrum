import { describe, expect, it, vi } from "vitest";

import { createReputationStore } from "./store.js";
import { ensureAttestationTopic, listAttestations, submitAttestation } from "./attestation.js";

describe("attestations", () => {
  it("creates topic and records attestations", async () => {
    const store = createReputationStore();

    const topic = await ensureAttestationTopic({
      store,
      deps: {
        createTopic: vi.fn().mockResolvedValue({
          topicId: "0.0.9100",
          topicUrl: "https://hashscan.io/testnet/topic/0.0.9100",
          transactionId: "tx1",
          transactionUrl: "https://hashscan.io/testnet/transaction/tx1"
        }),
        submitMessage: vi.fn(),
        getMessages: vi.fn(),
        now: () => new Date("2026-02-18T00:00:00.000Z")
      }
    });

    expect(topic.topicId).toBe("0.0.9100");

    const attestation = await submitAttestation(
      {
        subjectAccountId: "0.0.2001",
        attesterAccountId: "0.0.2002",
        scoreDelta: 15,
        confidence: 0.9,
        reason: "Delivered on time",
        tags: ["delivery"]
      },
      {
        store,
        deps: {
          createTopic: vi.fn(),
          submitMessage: vi.fn().mockResolvedValue({
            topicId: "0.0.9100",
            topicUrl: "https://hashscan.io/testnet/topic/0.0.9100",
            transactionId: "tx2",
            transactionUrl: "https://hashscan.io/testnet/transaction/tx2",
            sequenceNumber: 1
          }),
          getMessages: vi.fn(),
          now: () => new Date("2026-02-18T00:10:00.000Z")
        }
      }
    );

    expect(attestation.topicId).toBe("0.0.9100");
    expect(store.attestations).toHaveLength(1);

    const loaded = await listAttestations("0.0.9100", {
      store,
      deps: {
        createTopic: vi.fn(),
        submitMessage: vi.fn(),
        getMessages: vi.fn().mockResolvedValue({
          messages: [
            {
              sequenceNumber: 1,
              consensusTimestamp: "1700000000.000000001",
              message: JSON.stringify(attestation)
            }
          ],
          nextLink: null
        }),
        now: () => new Date("2026-02-18T00:15:00.000Z")
      }
    });

    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.subjectAccountId).toBe("0.0.2001");
  });
});
