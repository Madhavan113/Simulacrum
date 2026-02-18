import { InsuranceError } from "./types.js";

export interface PremiumInputs {
  coverageAmountHbar: number;
  riskScore: number;
  marketVolatility: number;
  durationDays: number;
  baseRateBps?: number;
}

export interface PremiumQuote {
  premiumRateBps: number;
  premiumAmountHbar: number;
  riskMultiplier: number;
}

function validatePositiveNumber(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new InsuranceError(`${field} must be a positive number.`);
  }
}

function validateNonNegativeNumber(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new InsuranceError(`${field} must be a non-negative number.`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function calculatePremium(inputs: PremiumInputs): PremiumQuote {
  validatePositiveNumber(inputs.coverageAmountHbar, "coverageAmountHbar");
  validateNonNegativeNumber(inputs.riskScore, "riskScore");
  validateNonNegativeNumber(inputs.marketVolatility, "marketVolatility");
  validatePositiveNumber(inputs.durationDays, "durationDays");

  const baseRateBps = inputs.baseRateBps ?? 300;
  validatePositiveNumber(baseRateBps, "baseRateBps");

  const normalizedRisk = clamp(inputs.riskScore / 100, 0, 2);
  const normalizedVolatility = clamp(inputs.marketVolatility / 100, 0, 2);
  const durationFactor = clamp(inputs.durationDays / 30, 0.25, 6);

  const riskMultiplier = 1 + normalizedRisk * 0.9 + normalizedVolatility * 0.6;
  const premiumRateBps = Math.round(baseRateBps * riskMultiplier * Math.sqrt(durationFactor));
  const premiumAmountHbar = (inputs.coverageAmountHbar * premiumRateBps) / 10_000;

  return {
    premiumRateBps,
    premiumAmountHbar,
    riskMultiplier
  };
}
