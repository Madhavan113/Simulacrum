export type MarketStatus = "OPEN" | "CLOSED" | "RESOLVED" | "DISPUTED";

export interface MarketSelfAttestation {
  proposedOutcome: string;
  attestedByAccountId: string;
  reason?: string;
  evidence?: string;
  attestedAt: string;
}

export interface MarketChallenge {
  id: string;
  marketId: string;
  challengerAccountId: string;
  proposedOutcome: string;
  reason: string;
  evidence?: string;
  createdAt: string;
}

export interface MarketOracleVote {
  id: string;
  marketId: string;
  voterAccountId: string;
  outcome: string;
  confidence: number;
  reason?: string;
  reputationScore?: number;
  createdAt: string;
}

export interface Market {
  id: string;
  question: string;
  description?: string;
  creatorAccountId: string;
  escrowAccountId: string;
  topicId: string;
  topicUrl: string;
  closeTime: string;
  createdAt: string;
  status: MarketStatus;
  outcomes: string[];
  initialOddsByOutcome?: Record<string, number>;
  outcomeTokenIds: Record<string, string>;
  outcomeTokenUrls: Record<string, string>;
  resolvedOutcome?: string;
  resolvedAt?: string;
  resolvedByAccountId?: string;
  selfAttestation?: MarketSelfAttestation;
  challengeWindowEndsAt?: string;
  challenges?: MarketChallenge[];
  oracleVotes?: MarketOracleVote[];
}

export interface CreateMarketInput {
  question: string;
  description?: string;
  creatorAccountId: string;
  closeTime: string;
  escrowAccountId?: string;
  outcomes?: readonly string[];
  initialOddsByOutcome?: Record<string, number>;
}

export interface MarketBet {
  id: string;
  marketId: string;
  bettorAccountId: string;
  outcome: string;
  amountHbar: number;
  placedAt: string;
  escrowTransactionId?: string;
  escrowTransactionUrl?: string;
  topicTransactionId?: string;
  topicSequenceNumber?: number;
}

export interface PlaceBetInput {
  marketId: string;
  bettorAccountId: string;
  outcome: string;
  amountHbar: number;
}

export interface MarketResolution {
  marketId: string;
  resolvedOutcome: string;
  resolvedByAccountId: string;
  resolvedAt: string;
  topicTransactionId?: string;
  topicTransactionUrl?: string;
  topicSequenceNumber?: number;
}

export interface ResolveMarketInput {
  marketId: string;
  resolvedOutcome: string;
  resolvedByAccountId: string;
  reason?: string;
}

export interface SelfAttestMarketInput {
  marketId: string;
  attestedByAccountId: string;
  proposedOutcome: string;
  reason?: string;
  evidence?: string;
  challengeWindowMinutes?: number;
}

export interface ChallengeMarketInput {
  marketId: string;
  challengerAccountId: string;
  proposedOutcome: string;
  reason: string;
  evidence?: string;
}

export interface OracleVoteInput {
  marketId: string;
  voterAccountId: string;
  outcome: string;
  confidence?: number;
  reason?: string;
  reputationScore?: number;
}

export interface ClaimRecord {
  id: string;
  marketId: string;
  accountId: string;
  payoutHbar: number;
  createdAt: string;
  escrowTransactionId?: string;
  escrowTransactionUrl?: string;
}

export interface ClaimWinningsInput {
  marketId: string;
  accountId: string;
  payoutAccountId?: string;
}

export type OrderSide = "BID" | "ASK";

export interface MarketOrder {
  id: string;
  marketId: string;
  accountId: string;
  outcome: string;
  side: OrderSide;
  quantity: number;
  price: number;
  createdAt: string;
  status: "OPEN" | "CANCELLED";
  topicTransactionId?: string;
  topicTransactionUrl?: string;
  topicSequenceNumber?: number;
}

export interface PublishOrderInput {
  marketId: string;
  accountId: string;
  outcome: string;
  side: OrderSide;
  quantity: number;
  price: number;
}

export interface OrderBookSnapshot {
  marketId: string;
  orders: MarketOrder[];
  bids: MarketOrder[];
  asks: MarketOrder[];
}

export class MarketError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "MarketError";
  }
}
