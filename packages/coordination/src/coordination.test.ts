import { describe, expect, it, vi } from "vitest";

import {
  createAssuranceContract,
  evaluateAssuranceContract,
  pledgeToAssurance
} from "./assurance.js";
import {
  completeCommitment,
  createCollectiveCommitment,
  joinCommitment
} from "./commitment.js";
import { findSchellingPoint } from "./schelling.js";
import { createCoordinationStore } from "./store.js";

describe("coordination", () => {
  it("supports assurance contract lifecycle", async () => {
    const store = createCoordinationStore();
    const createTopicMock = vi.fn().mockResolvedValue({
      topicId: "0.0.9301",
      topicUrl: "https://hashscan.io/testnet/topic/0.0.9301",
      transactionId: "tx1",
      transactionUrl: "https://hashscan.io/testnet/transaction/tx1"
    });
    const transferMock = vi.fn().mockResolvedValue({
      transactionId: "tx2",
      transactionUrl: "https://hashscan.io/testnet/transaction/tx2"
    });

    const contract = await createAssuranceContract(
      {
        title: "Ship backend",
        organizerAccountId: "0.0.1001",
        thresholdHbar: 50,
        deadline: "2026-12-31T00:00:00.000Z"
      },
      {
        store,
        deps: {
          transferHbar: transferMock,
          createTopic: createTopicMock,
          submitMessage: vi.fn(),
          now: () => new Date("2026-02-18T00:00:00.000Z")
        }
      }
    );

    await pledgeToAssurance(contract.id, "0.0.2001", 30, {
      store,
      deps: {
        transferHbar: transferMock,
        createTopic: createTopicMock,
        submitMessage: vi.fn(),
        now: () => new Date("2026-02-18T00:05:00.000Z")
      }
    });

    await pledgeToAssurance(contract.id, "0.0.2002", 20, {
      store,
      deps: {
        transferHbar: transferMock,
        createTopic: createTopicMock,
        submitMessage: vi.fn(),
        now: () => new Date("2026-02-18T00:06:00.000Z")
      }
    });

    const evaluated = evaluateAssuranceContract(contract.id, store);
    expect(evaluated.status).toBe("TRIGGERED");
  });

  it("supports collective commitments", async () => {
    const store = createCoordinationStore();
    const createTopicMock = vi.fn().mockResolvedValue({
      topicId: "0.0.9302",
      topicUrl: "https://hashscan.io/testnet/topic/0.0.9302",
      transactionId: "tx3",
      transactionUrl: "https://hashscan.io/testnet/transaction/tx3"
    });

    const commitment = await createCollectiveCommitment(
      {
        name: "Collective testnet launch",
        creatorAccountId: "0.0.1001",
        requiredParticipants: 2,
        deadline: "2026-12-31T00:00:00.000Z"
      },
      {
        store,
        deps: {
          createTopic: createTopicMock,
          submitMessage: vi.fn(),
          now: () => new Date("2026-02-18T00:00:00.000Z")
        }
      }
    );

    const active = await joinCommitment(commitment.id, "0.0.2001", {
      store,
      deps: {
        createTopic: createTopicMock,
        submitMessage: vi.fn(),
        now: () => new Date("2026-02-18T00:10:00.000Z")
      }
    });

    expect(active.status).toBe("ACTIVE");

    await completeCommitment(commitment.id, "0.0.1001", {
      store,
      deps: {
        createTopic: createTopicMock,
        submitMessage: vi.fn(),
        now: () => new Date("2026-02-18T00:20:00.000Z")
      }
    });

    const completed = await completeCommitment(commitment.id, "0.0.2001", {
      store,
      deps: {
        createTopic: createTopicMock,
        submitMessage: vi.fn(),
        now: () => new Date("2026-02-18T00:30:00.000Z")
      }
    });

    expect(completed.status).toBe("COMPLETED");
  });

  it("finds schelling points", () => {
    const result = findSchellingPoint([
      { voterAccountId: "0.0.1", option: "YES", weight: 1 },
      { voterAccountId: "0.0.2", option: "YES", weight: 2 },
      { voterAccountId: "0.0.3", option: "NO", weight: 1 }
    ]);

    expect(result.winningOption).toBe("YES");
    expect(result.confidence).toBe(0.75);
  });
});
