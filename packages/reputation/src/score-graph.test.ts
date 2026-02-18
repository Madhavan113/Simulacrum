import { describe, expect, it } from "vitest";

import { buildTrustGraph, detectTrustClusters, getTrustScoreBetween } from "./graph.js";
import { buildReputationLeaderboard, calculateReputationScore } from "./score.js";
import type { ReputationAttestation } from "./types.js";

const attestations: ReputationAttestation[] = [
  {
    id: "a1",
    topicId: "0.0.1",
    subjectAccountId: "0.0.alice",
    attesterAccountId: "0.0.bob",
    scoreDelta: 20,
    confidence: 0.9,
    tags: ["quality"],
    createdAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "a2",
    topicId: "0.0.1",
    subjectAccountId: "0.0.alice",
    attesterAccountId: "0.0.cara",
    scoreDelta: 10,
    confidence: 0.8,
    tags: ["speed"],
    createdAt: "2026-01-15T00:00:00.000Z"
  },
  {
    id: "a3",
    topicId: "0.0.1",
    subjectAccountId: "0.0.bob",
    attesterAccountId: "0.0.alice",
    scoreDelta: 12,
    confidence: 0.75,
    tags: ["fairness"],
    createdAt: "2026-02-01T00:00:00.000Z"
  }
];

describe("scoring and trust graph", () => {
  it("computes reputation scores", () => {
    const score = calculateReputationScore("0.0.alice", attestations, {
      now: new Date("2026-02-18T00:00:00.000Z")
    });

    expect(score.score).toBeGreaterThan(50);

    const leaderboard = buildReputationLeaderboard(attestations, {
      now: new Date("2026-02-18T00:00:00.000Z")
    });

    expect(leaderboard[0]?.accountId).toBe("0.0.alice");
  });

  it("builds trust graph and clusters", () => {
    const graph = buildTrustGraph(attestations);

    expect(graph.nodes).toContain("0.0.alice");
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(getTrustScoreBetween(graph, "0.0.bob", "0.0.alice")).toBeGreaterThan(0);

    const clusters = detectTrustClusters(graph);
    expect(clusters[0]?.length).toBe(3);
  });
});
