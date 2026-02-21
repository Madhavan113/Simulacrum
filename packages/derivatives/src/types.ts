/**
 * Derivatives types for Simulacrum agent-native securities.
 *
 * The "underlying" for all derivatives is a market outcome probability (0–1).
 * Agents take leveraged long/short positions or trade options on these
 * probabilities, inspired by Hyperliquid's perpetual + options architecture
 * but settled in HBAR on Hedera.
 */

// ---------------------------------------------------------------------------
// Enums / unions
// ---------------------------------------------------------------------------

export type MarginMode = "CROSS" | "ISOLATED";
export type PositionSide = "LONG" | "SHORT";
export type PositionStatus = "OPEN" | "CLOSING" | "CLOSED" | "LIQUIDATED";
export type OptionType = "CALL" | "PUT";
export type OptionStyle = "EUROPEAN" | "AMERICAN";
export type OptionStatus = "ACTIVE" | "EXERCISED" | "EXPIRED" | "CANCELLED";
export type LiquidationTier = 1 | 2 | 3;
export type DerivativeType = "PERPETUAL" | "CALL_OPTION" | "PUT_OPTION";

// ---------------------------------------------------------------------------
// Margin
// ---------------------------------------------------------------------------

export interface MarginAccount {
  id: string;
  accountId: string;
  balanceHbar: number;
  lockedHbar: number;
  mode: MarginMode;
  createdAt: string;
  updatedAt: string;
}

export interface DepositMarginInput {
  accountId: string;
  amountHbar: number;
  mode?: MarginMode;
}

export interface WithdrawMarginInput {
  accountId: string;
  amountHbar: number;
}

// ---------------------------------------------------------------------------
// Perpetual positions
// ---------------------------------------------------------------------------

/**
 * A leveraged position on a market outcome probability.
 *
 * LONG  = agent profits when probability rises
 * SHORT = agent profits when probability falls
 *
 * Entry/mark prices are probabilities in [0, 1].
 * Notional = sizeHbar (denominated in HBAR).
 */
export interface PerpetualPosition {
  id: string;
  marketId: string;
  accountId: string;
  outcome: string;
  side: PositionSide;
  sizeHbar: number;
  entryPrice: number;
  markPrice: number;
  leverage: number;
  marginMode: MarginMode;
  marginHbar: number;
  unrealizedPnlHbar: number;
  liquidationPrice: number;
  fundingAccruedHbar: number;
  status: PositionStatus;
  openedAt: string;
  closedAt?: string;
  realizedPnlHbar?: number;
  topicTransactionId?: string;
}

export interface OpenPositionInput {
  marketId: string;
  accountId: string;
  outcome: string;
  side: PositionSide;
  sizeHbar: number;
  leverage: number;
  marginMode?: MarginMode;
}

export interface ClosePositionInput {
  positionId: string;
  accountId: string;
  /** Fraction of position to close (0, 1]. Defaults to 1 (full close). */
  fraction?: number;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * An option contract on a market outcome probability.
 *
 * CALL = right to profit if probability > strike at expiry
 * PUT  = right to profit if probability < strike at expiry
 *
 * Cash-settled in HBAR. European-style by default (exercise at expiry only).
 */
export interface OptionContract {
  id: string;
  marketId: string;
  outcome: string;
  optionType: OptionType;
  style: OptionStyle;
  strikePrice: number;
  premiumHbar: number;
  sizeHbar: number;
  expiresAt: string;
  writerAccountId: string;
  holderAccountId: string;
  collateralHbar: number;
  status: OptionStatus;
  createdAt: string;
  exercisedAt?: string;
  settlementHbar?: number;
  topicTransactionId?: string;
}

export interface WriteOptionInput {
  marketId: string;
  outcome: string;
  optionType: OptionType;
  style?: OptionStyle;
  strikePrice: number;
  sizeHbar: number;
  premiumHbar: number;
  writerAccountId: string;
  expiresAt?: string;
}

export interface BuyOptionInput {
  optionId: string;
  holderAccountId: string;
}

export interface ExerciseOptionInput {
  optionId: string;
  holderAccountId: string;
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/**
 * Snapshot of price feeds for a given market outcome.
 * Mirrors Hyperliquid's median-of-three approach adapted for probability
 * markets: index price = market probability, mark price = median of
 * (index, last trade, EMA smoothed).
 */
export interface PriceSnapshot {
  marketId: string;
  outcome: string;
  indexPrice: number;
  markPrice: number;
  lastTradePrice: number;
  emaPrice: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Funding
// ---------------------------------------------------------------------------

/**
 * Funding rate snapshot.
 *
 * Positive rate = longs pay shorts (perp premium above index).
 * Negative rate = shorts pay longs.
 *
 * Settled hourly, computed as 8-hour rate paid 1/8 each hour.
 */
export interface FundingRate {
  marketId: string;
  outcome: string;
  rate: number;
  premiumIndex: number;
  markPrice: number;
  indexPrice: number;
  timestamp: string;
}

export interface FundingPayment {
  id: string;
  positionId: string;
  marketId: string;
  accountId: string;
  amountHbar: number;
  rate: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Liquidation
// ---------------------------------------------------------------------------

export interface LiquidationEvent {
  id: string;
  positionId: string;
  marketId: string;
  accountId: string;
  tier: LiquidationTier;
  sizeHbar: number;
  lossHbar: number;
  insuranceFundDelta: number;
  timestamp: string;
}

export interface InsuranceFund {
  balanceHbar: number;
  totalDeposits: number;
  totalPayouts: number;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

export interface DerivativesOverview {
  totalOpenInterestHbar: number;
  totalPositions: number;
  totalOptions: number;
  totalMarginLockedHbar: number;
  insuranceFundHbar: number;
  recentFundingRates: FundingRate[];
  recentLiquidations: LiquidationEvent[];
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class DerivativesError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "DerivativesError";
  }
}
