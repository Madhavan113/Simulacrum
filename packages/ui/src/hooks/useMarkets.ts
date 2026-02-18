import { useQueries, useQuery } from '@tanstack/react-query'
import { marketsApi } from '../api/markets'

export function useMarkets() {
  return useQuery({ queryKey: ['markets'], queryFn: marketsApi.list })
}

export function useMarket(id: string) {
  return useQuery({
    queryKey: ['markets', id],
    queryFn: () => marketsApi.get(id),
    enabled: Boolean(id),
  })
}

export function useMarketBets(id: string) {
  return useQuery({
    queryKey: ['market-bets', id],
    queryFn: () => marketsApi.bets(id),
    enabled: Boolean(id),
    refetchInterval: 15_000,
  })
}

export function useMarketBetsByIds(ids: readonly string[]) {
  return useQueries({
    queries: ids.map(id => ({
      queryKey: ['market-bets', id],
      queryFn: () => marketsApi.bets(id),
      enabled: Boolean(id),
      refetchInterval: 15_000,
    })),
  })
}

export function useOrderBook(id: string) {
  return useQuery({
    queryKey: ['orderbook', id],
    queryFn: () => marketsApi.orderBook(id),
    enabled: Boolean(id),
    refetchInterval: 15_000,
  })
}
