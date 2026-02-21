import { apiFetch } from './client'

export interface PerpetualPosition {
  id: string
  marketId: string
  accountId: string
  outcome: string
  side: 'LONG' | 'SHORT'
  sizeHbar: number
  entryPrice: number
  markPrice: number
  leverage: number
  marginMode: 'CROSS' | 'ISOLATED'
  marginHbar: number
  unrealizedPnlHbar: number
  liquidationPrice: number
  fundingAccruedHbar: number
  status: 'OPEN' | 'CLOSING' | 'CLOSED' | 'LIQUIDATED'
  openedAt: string
  closedAt?: string
  realizedPnlHbar?: number
}

export interface OptionContract {
  id: string
  marketId: string
  outcome: string
  optionType: 'CALL' | 'PUT'
  style: 'EUROPEAN' | 'AMERICAN'
  strikePrice: number
  premiumHbar: number
  sizeHbar: number
  expiresAt: string
  writerAccountId: string
  holderAccountId: string
  collateralHbar: number
  status: 'ACTIVE' | 'EXERCISED' | 'EXPIRED' | 'CANCELLED'
  createdAt: string
  exercisedAt?: string
  settlementHbar?: number
  currentPremiumHbar?: number
  currentMarkPrice?: number
  timeToExpiryDays?: number
  holderPnlHbar?: number
  writerPnlHbar?: number
  lastRefreshedAt?: string
}

export interface MarginAccount {
  id: string
  accountId: string
  balanceHbar: number
  lockedHbar: number
  mode: 'CROSS' | 'ISOLATED'
  createdAt: string
  updatedAt: string
}

export interface FundingRate {
  marketId: string
  outcome: string
  rate: number
  premiumIndex: number
  markPrice: number
  indexPrice: number
  timestamp: string
}

export interface DerivativesOverview {
  totalOpenInterestHbar: number
  totalPositions: number
  totalOptions: number
  totalMarginLockedHbar: number
  insuranceFundHbar: number
  recentFundingRates: FundingRate[]
  recentLiquidations: unknown[]
}

export const derivativesApi = {
  positions:     ()              => apiFetch<{ positions: PerpetualPosition[] }>('/derivatives/positions').then(r => r.positions),
  position:      (id: string)    => apiFetch<{ position: PerpetualPosition }>(`/derivatives/positions/${id}`).then(r => r.position),
  options:       ()              => apiFetch<{ options: OptionContract[] }>('/derivatives/options').then(r => r.options),
  option:        (id: string)    => apiFetch<{ option: OptionContract }>(`/derivatives/options/${id}`).then(r => r.option),
  marginAccount: (accountId: string) => apiFetch<{ account: MarginAccount }>(`/derivatives/margin/${accountId}`).then(r => r.account),
  fundingRates:  (marketId: string)  => apiFetch<{ rates: FundingRate[] }>(`/derivatives/funding/${marketId}`).then(r => r.rates),
  overview:      ()              => apiFetch<DerivativesOverview>('/derivatives/overview'),
}
