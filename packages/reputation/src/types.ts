export interface RepTokenConfig {
  tokenId: string;
  tokenUrl: string;
  treasuryAccountId: string;
  createdAt: string;
  transactionId: string;
  transactionUrl: string;
}

export interface ReputationAttestation {
  id: string;
  topicId: string;
  topicUrl?: string;
  subjectAccountId: string;
  attesterAccountId: string;
  scoreDelta: number;
  confidence: number;
  reason?: string;
  tags: string[];
  createdAt: string;
  sequenceNumber?: number;
  transactionId?: string;
  transactionUrl?: string;
}

export interface ReputationScore {
  accountId: string;
  score: number;
  rawScore: number;
  attestationCount: number;
  confidence: number;
}

export interface TrustEdge {
  from: string;
  to: string;
  weight: number;
  attestations: number;
}

export interface TrustGraph {
  nodes: string[];
  edges: TrustEdge[];
  adjacency: Record<string, TrustEdge[]>;
}

export class ReputationError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "ReputationError";
  }
}
