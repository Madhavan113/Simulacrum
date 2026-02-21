// Margin
export {
  computeInitialMargin,
  computeMaintenanceMargin,
  depositMargin,
  getEffectiveEquity,
  getMarginAccount,
  lockMargin,
  releaseMargin,
  withdrawMargin,
  type MarginOptions
} from "./margin.js";

// Pricing oracle
export {
  computeMarkPrice,
  getMarkPrice,
  type ComputeMarkPriceOptions
} from "./pricing.js";

// Perpetual positions
export {
  closePosition,
  getOpenInterest,
  getPosition,
  getPositionsForAccount,
  getPositionsForMarket,
  openPosition,
  refreshPosition,
  type PerpetualOptions
} from "./perpetual.js";

// Funding rates
export {
  computeFundingRate,
  getFundingHistory,
  getLatestFundingRate,
  settleFunding,
  type FundingOptions
} from "./funding.js";

// Options
export {
  buyOption,
  estimateOptionPremium,
  exerciseOption,
  expireOptions,
  getAvailableOptions,
  getOption,
  getOptionsForMarket,
  refreshAllOptions,
  refreshOption,
  writeOption,
  type OptionsOperationOptions
} from "./options.js";

// Liquidation engine
export {
  depositInsuranceFund,
  getInsuranceFund,
  getRecentLiquidations,
  liquidatePosition,
  sweepLiquidations,
  type LiquidationOptions
} from "./liquidation.js";

// Store
export {
  createDerivativesStore,
  getDerivativesStore,
  persistDerivativesStore,
  resetDerivativesStoreForTests,
  type DerivativesStore
} from "./store.js";

// Types (re-export everything)
export {
  DerivativesError,
  type BuyOptionInput,
  type ClosePositionInput,
  type DepositMarginInput,
  type DerivativeType,
  type DerivativesOverview,
  type ExerciseOptionInput,
  type FundingPayment,
  type FundingRate,
  type InsuranceFund,
  type LiquidationEvent,
  type LiquidationTier,
  type MarginAccount,
  type MarginMode,
  type OpenPositionInput,
  type OptionContract,
  type OptionStatus,
  type OptionStyle,
  type OptionType,
  type PerpetualPosition,
  type PositionSide,
  type PositionStatus,
  type PriceSnapshot,
  type WithdrawMarginInput,
  type WriteOptionInput
} from "./types.js";
