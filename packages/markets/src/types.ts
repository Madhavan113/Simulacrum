export type MarketStatus = "OPEN" | "CLOSED" | "RESOLVED" | "DISPUTED" | "SETTLED";
/**
 * Liquidity regime for a market.
 *
 * Preferred aliases (describe the regime, not the mechanism):
 *   HIGH_LIQUIDITY → CLOB order-book matching
 *   LOW_LIQUIDITY  → LMSR automated market maker
 *
 * Legacy names CLOB / WEIGHTED_CURVE are kept for backward compatibility.
 */
export type MarketLiquidityModel =
  | "CLOB"
  | "WEIGHTED_CURVE"
  | "HIGH_LIQUIDITY"
  | "LOW_LIQUIDITY";

/**
 * Tracks the source of the current mark price for a market.
 *
 * LMSR_CURVE    — derived from LMSR curve state (authoritative for LOW_LIQUIDITY markets)
 * CLOB_MID      — mid-price of best bid/ask on the order book
 * CLOB_LAST_FILL — price of most recent order fill (fallback when no open spread)
 * INITIAL       — initial odds from market creation (no trading has occurred)
 */
export type MarkPriceSource = "LMSR_CURVE" | "CLOB_MID" | "CLOB_LAST_FILL" | "INITIAL";

export interface MarketCurveState {
  liquidityParameterHbar: number;
  sharesByOutcome: Record<string, number>;
}

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
  liquidityModel?: MarketLiquidityModel;
  initialOddsByOutcome?: Record<string, number>;
  currentOddsByOutcome?: Record<string, number>;
  curveState?: MarketCurveState;
  outcomeTokenIds?: Record<string, string>;
  outcomeTokenUrls?: Record<string, string>;
  syntheticOutcomeIds?: Record<string, string>;
  resolvedOutcome?: string;
  resolvedAt?: string;
  resolvedByAccountId?: string;
  selfAttestation?: MarketSelfAttestation;
  challengeWindowEndsAt?: string;
  challenges?: MarketChallenge[];
  oracleVotes?: MarketOracleVote[];
  initialFundingHbar?: number;
  fundingTransactionId?: string;
  fundingTransactionUrl?: string;
  markPriceSource?: MarkPriceSource;
}

export interface CreateMarketInput {
  question: string;
  description?: string;
  creatorAccountId: string;
  closeTime: string;
  escrowAccountId?: string;
  outcomes?: readonly string[];
  initialOddsByOutcome?: Record<string, number>;
  lowLiquidity?: boolean;
  liquidityModel?: MarketLiquidityModel;
  curveLiquidityHbar?: number;
  /** HBAR deposited to escrow at creation. Required — markets cannot exist without economic backing. */
  initialFundingHbar: number;
  /** Seed orders for CLOB markets. Required for HIGH_LIQUIDITY — must include at least one BID and one ASK. */
  seedOrders?: SeedOrder[];
}

export interface SeedOrder {
  outcome: string;
  side: OrderSide;
  quantity: number;
  price: number;
}

export interface MarketBet {
  id: string;
  marketId: string;
  bettorAccountId: string;
  outcome: string;
  amountHbar: number;
  curveSharesPurchased?: number;
  effectiveOdds?: number;
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
  /** Maximum acceptable implied probability (0-100) for curve markets. Bet fails if price exceeds this. */
  maxPricePercent?: number;
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
  status: "OPEN" | "CANCELLED" | "FILLED";
  filledQuantity?: number;
  topicTransactionId?: string;
  topicTransactionUrl?: string;
  topicSequenceNumber?: number;
}

export interface OrderFill {
  id: string;
  marketId: string;
  outcome: string;
  bidOrderId: string;
  askOrderId: string;
  bidAccountId: string;
  askAccountId: string;
  price: number;
  quantity: number;
  createdAt: string;
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
  /** Mid-price per outcome computed from the order book spread. Undefined when no spread exists. */
  markPrice?: Record<string, number>;
}

export class MarketError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "MarketError";
  }
}
