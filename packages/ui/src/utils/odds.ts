import type { OrderBookSnapshot } from '../api/types'

interface ComputeImpliedOddsInput {
  outcomes: string[]
  orderBook?: OrderBookSnapshot | null
  initialOddsByOutcome?: Record<string, number>
  stakeByOutcome?: Record<string, number>
  resolvedOutcome?: string
}

function normalize(
  outcomes: readonly string[],
  values: Record<string, number> | undefined,
): { weights: Record<string, number>; total: number } {
  const weights: Record<string, number> = Object.fromEntries(outcomes.map((outcome) => [outcome, 0]))
  let total = 0

  for (const outcome of outcomes) {
    const value = values?.[outcome]
    const amount =
      typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : 0
    weights[outcome] = amount
    total += amount
  }

  return { weights, total }
}

function evenWeights(outcomes: readonly string[]): Record<string, number> {
  return Object.fromEntries(outcomes.map((outcome) => [outcome, 1]))
}

function orderBookWeights(outcomes: readonly string[], orderBook?: OrderBookSnapshot | null): Record<string, number> | undefined {
  if (!orderBook) {
    return undefined
  }

  const weights: Record<string, number> = Object.fromEntries(outcomes.map((outcome) => [outcome, 0]))
  const openOrders = orderBook.orders.filter(order => order.status === 'OPEN')

  for (const order of openOrders) {
    if (!(order.outcome in weights)) {
      continue
    }

    const notional = order.quantity * order.price

    if (order.side === 'BID') {
      weights[order.outcome] += notional
    } else {
      weights[order.outcome] += order.quantity * (1 - order.price)
    }
  }

  return weights
}

function toPercentages(outcomes: readonly string[], rawWeights: Record<string, number>): Record<string, number> {
  const { weights, total } = normalize(outcomes, rawWeights)

  if (total <= 0) {
    return Object.fromEntries(outcomes.map((outcome) => [outcome, 0]))
  }

  let running = 0

  return Object.fromEntries(outcomes.map((outcome, index) => {
    if (index === outcomes.length - 1) {
      return [outcome, Math.max(0, 100 - running)]
    }

    const value = Math.max(0, Math.round((weights[outcome] / total) * 100))
    running += value
    return [outcome, value]
  }))
}

function combineWeightedSignals(
  outcomes: readonly string[],
  signals: Array<{ values: Record<string, number>; weight: number }>,
): Record<string, number> {
  const combined: Record<string, number> = Object.fromEntries(outcomes.map((outcome) => [outcome, 0]))

  for (const signal of signals) {
    if (signal.weight <= 0) {
      continue
    }

    const { weights, total } = normalize(outcomes, signal.values)

    if (total <= 0) {
      continue
    }

    for (const outcome of outcomes) {
      combined[outcome] += (weights[outcome] / total) * signal.weight
    }
  }

  return combined
}

/**
 * Derive displayed odds from multiple signals.
 * Primary signal: staked bet volume.
 * Secondary signal: order book depth.
 * Baseline fallback: initial listing odds.
 */
export function computeImpliedOdds(input: ComputeImpliedOddsInput): Record<string, number> {
  const { outcomes, orderBook, initialOddsByOutcome, stakeByOutcome, resolvedOutcome } = input

  if (outcomes.length === 0) {
    return {}
  }

  const normalizedResolvedOutcome = resolvedOutcome?.trim().toUpperCase()

  if (normalizedResolvedOutcome && outcomes.includes(normalizedResolvedOutcome)) {
    return Object.fromEntries(
      outcomes.map((outcome) => [outcome, outcome === normalizedResolvedOutcome ? 100 : 0]),
    )
  }

  const base = normalize(outcomes, initialOddsByOutcome)
  const stake = normalize(outcomes, stakeByOutcome)
  const depth = normalize(outcomes, orderBookWeights(outcomes, orderBook))

  const baselineSignal = base.total > 0 ? base.weights : evenWeights(outcomes)
  const stakeAvailable = stake.total > 0
  const depthAvailable = depth.total > 0

  let signals: Array<{ values: Record<string, number>; weight: number }>

  if (stakeAvailable && depthAvailable) {
    signals = [
      { values: baselineSignal, weight: 1.0 },
      { values: stake.weights, weight: 4.0 },
      { values: depth.weights, weight: 1.0 },
    ]
  } else if (stakeAvailable) {
    signals = [
      { values: baselineSignal, weight: 1.0 },
      { values: stake.weights, weight: 4.0 },
    ]
  } else if (depthAvailable) {
    signals = [
      { values: baselineSignal, weight: 2.5 },
      { values: depth.weights, weight: 1.5 },
    ]
  } else {
    signals = [{ values: baselineSignal, weight: 1.0 }]
  }

  return toPercentages(outcomes, combineWeightedSignals(outcomes, signals))
}
