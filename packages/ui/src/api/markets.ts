import { apiFetch } from './client'
import type { Market, MarketBetsSnapshot, OrderBookSnapshot } from './types'

export const marketsApi = {
  list: () => apiFetch<{ markets: Market[] }>('/markets').then(r => r.markets),
  get:  (id: string) => apiFetch<{ market: Market }>(`/markets/${id}`).then(r => r.market),
  bets: (id: string) => apiFetch<MarketBetsSnapshot>(`/markets/${id}/bets`),
  orderBook: (id: string) => apiFetch<OrderBookSnapshot>(`/markets/${id}/orderbook`),
}
