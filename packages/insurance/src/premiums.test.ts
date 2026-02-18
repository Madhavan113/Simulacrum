import { describe, expect, it } from "vitest";

import { calculatePremium } from "./premiums.js";

describe("calculatePremium", () => {
  it("returns a premium quote with expected fields", () => {
    const quote = calculatePremium({
      coverageAmountHbar: 100,
      riskScore: 50,
      marketVolatility: 50,
      durationDays: 30
    });

    expect(quote.premiumRateBps).toBeGreaterThan(0);
    expect(quote.premiumAmountHbar).toBeGreaterThan(0);
    expect(quote.riskMultiplier).toBeGreaterThan(1);
  });

  it("increases premium with higher risk score", () => {
    const low = calculatePremium({
      coverageAmountHbar: 100,
      riskScore: 10,
      marketVolatility: 30,
      durationDays: 30
    });

    const high = calculatePremium({
      coverageAmountHbar: 100,
      riskScore: 90,
      marketVolatility: 30,
      durationDays: 30
    });

    expect(high.premiumAmountHbar).toBeGreaterThan(low.premiumAmountHbar);
  });

  it("increases premium with higher market volatility", () => {
    const low = calculatePremium({
      coverageAmountHbar: 100,
      riskScore: 50,
      marketVolatility: 10,
      durationDays: 30
    });

    const high = calculatePremium({
      coverageAmountHbar: 100,
      riskScore: 50,
      marketVolatility: 90,
      durationDays: 30
    });

    expect(high.premiumAmountHbar).toBeGreaterThan(low.premiumAmountHbar);
  });

  it("increases premium with longer duration", () => {
    const short = calculatePremium({
      coverageAmountHbar: 100,
      riskScore: 50,
      marketVolatility: 50,
      durationDays: 10
    });

    const long = calculatePremium({
      coverageAmountHbar: 100,
      riskScore: 50,
      marketVolatility: 50,
      durationDays: 180
    });

    expect(long.premiumAmountHbar).toBeGreaterThan(short.premiumAmountHbar);
  });

  it("uses custom base rate when provided", () => {
    const defaultBase = calculatePremium({
      coverageAmountHbar: 100,
      riskScore: 50,
      marketVolatility: 50,
      durationDays: 30
    });

    const customBase = calculatePremium({
      coverageAmountHbar: 100,
      riskScore: 50,
      marketVolatility: 50,
      durationDays: 30,
      baseRateBps: 600
    });

    expect(customBase.premiumAmountHbar).toBeGreaterThan(defaultBase.premiumAmountHbar);
  });

  it("rejects zero coverage", () => {
    expect(() =>
      calculatePremium({
        coverageAmountHbar: 0,
        riskScore: 50,
        marketVolatility: 50,
        durationDays: 30
      })
    ).toThrow();
  });

  it("rejects negative risk score", () => {
    expect(() =>
      calculatePremium({
        coverageAmountHbar: 100,
        riskScore: -10,
        marketVolatility: 50,
        durationDays: 30
      })
    ).toThrow();
  });

  it("handles zero risk score", () => {
    const quote = calculatePremium({
      coverageAmountHbar: 100,
      riskScore: 0,
      marketVolatility: 0,
      durationDays: 30
    });

    expect(quote.riskMultiplier).toBe(1);
    expect(quote.premiumAmountHbar).toBeGreaterThan(0);
  });
});
