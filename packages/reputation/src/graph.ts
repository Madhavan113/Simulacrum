import type { ReputationAttestation, TrustEdge, TrustGraph } from "./types.js";

function edgeKey(from: string, to: string): string {
  return `${from}->${to}`;
}

export function buildTrustGraph(attestations: readonly ReputationAttestation[]): TrustGraph {
  const nodes = new Set<string>();
  const edgeStats = new Map<string, { from: string; to: string; total: number; count: number }>();

  for (const attestation of attestations) {
    nodes.add(attestation.attesterAccountId);
    nodes.add(attestation.subjectAccountId);

    const key = edgeKey(attestation.attesterAccountId, attestation.subjectAccountId);
    const current = edgeStats.get(key) ?? {
      from: attestation.attesterAccountId,
      to: attestation.subjectAccountId,
      total: 0,
      count: 0
    };

    current.total += attestation.scoreDelta * attestation.confidence;
    current.count += 1;
    edgeStats.set(key, current);
  }

  const edges: TrustEdge[] = Array.from(edgeStats.values()).map((entry) => ({
    from: entry.from,
    to: entry.to,
    weight: entry.total / Math.max(1, entry.count),
    attestations: entry.count
  }));

  const adjacency: Record<string, TrustEdge[]> = {};

  for (const node of nodes) {
    adjacency[node] = [];
  }

  for (const edge of edges) {
    adjacency[edge.from].push(edge);
  }

  return {
    nodes: Array.from(nodes),
    edges,
    adjacency
  };
}

export function getTrustScoreBetween(
  graph: TrustGraph,
  fromAccountId: string,
  toAccountId: string
): number {
  const direct = graph.adjacency[fromAccountId]?.find((edge) => edge.to === toAccountId);

  if (direct) {
    return direct.weight;
  }

  const firstHop = graph.adjacency[fromAccountId] ?? [];
  let best = 0;

  for (const edge of firstHop) {
    const second = graph.adjacency[edge.to]?.find((candidate) => candidate.to === toAccountId);

    if (second) {
      best = Math.max(best, (edge.weight + second.weight) / 2);
    }
  }

  return best;
}

export function detectTrustClusters(graph: TrustGraph): string[][] {
  const visited = new Set<string>();
  const clusters: string[][] = [];

  for (const node of graph.nodes) {
    if (visited.has(node)) {
      continue;
    }

    const cluster: string[] = [];
    const queue = [node];
    visited.add(node);

    while (queue.length > 0) {
      const current = queue.shift();

      if (!current) {
        continue;
      }

      cluster.push(current);

      const neighbors = [
        ...(graph.adjacency[current] ?? []).map((edge) => edge.to),
        ...graph.edges.filter((edge) => edge.to === current).map((edge) => edge.from)
      ];

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    clusters.push(cluster);
  }

  return clusters.sort((a, b) => b.length - a.length);
}
