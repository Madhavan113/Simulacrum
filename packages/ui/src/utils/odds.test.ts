import { describe, expect, it } from 'vitest'
import { computeImpliedOdds } from './odds'

describe('computeImpliedOdds', () => {
  it('returns empty object for empty outcomes', () => {
    expect(computeImpliedOdds({ outcomes: [] })).toEqual({})
  })

  it('returns even odds when no signals are provided', () => {
    const result = computeImpliedOdds({ outcomes: ['YES', 'NO'] })
    expect(result.YES).toBe(50)
    expect(result.NO).toBe(50)
  })

  it('uses seed odds when provided with no other signals', () => {
    const result = computeImpliedOdds({
      outcomes: ['YES', 'NO'],
      initialOddsByOutcome: { YES: 70, NO: 30 },
    })
    expect(result.YES).toBe(70)
    expect(result.NO).toBe(30)
  })

  it('returns 100% for resolved outcome', () => {
    const result = computeImpliedOdds({
      outcomes: ['YES', 'NO'],
      initialOddsByOutcome: { YES: 50, NO: 50 },
      resolvedOutcome: 'YES',
    })
    expect(result.YES).toBe(100)
    expect(result.NO).toBe(0)
  })

  it('handles case-insensitive resolved outcome', () => {
    const result = computeImpliedOdds({
      outcomes: ['YES', 'NO'],
      resolvedOutcome: 'yes',
    })
    expect(result.YES).toBe(100)
    expect(result.NO).toBe(0)
  })

  it('incorporates stake weights with seed odds', () => {
    const result = computeImpliedOdds({
      outcomes: ['YES', 'NO'],
      initialOddsByOutcome: { YES: 50, NO: 50 },
      stakeByOutcome: { YES: 100, NO: 0 },
    })
    // Stake has weight 4, seed has weight 1 => heavily skewed to YES
    expect(result.YES).toBeGreaterThan(80)
    expect(result.NO).toBeLessThan(20)
  })

  it('percentages always sum to 100', () => {
    const result = computeImpliedOdds({
      outcomes: ['A', 'B', 'C'],
      initialOddsByOutcome: { A: 33, B: 33, C: 34 },
    })
    const sum = Object.values(result).reduce((a, b) => a + b, 0)
    expect(sum).toBe(100)
  })

  it('handles three outcomes with stakes', () => {
    const result = computeImpliedOdds({
      outcomes: ['A', 'B', 'C'],
      stakeByOutcome: { A: 50, B: 30, C: 20 },
    })
    expect(result.A).toBeGreaterThan(result.B)
    expect(result.B).toBeGreaterThan(result.C)
    const sum = Object.values(result).reduce((a, b) => a + b, 0)
    expect(sum).toBe(100)
  })
})
