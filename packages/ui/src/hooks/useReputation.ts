import { useQuery } from '@tanstack/react-query'
import { reputationApi } from '../api/reputation'

export function useLeaderboard() {
  return useQuery({ queryKey: ['reputation', 'leaderboard'], queryFn: reputationApi.leaderboard })
}

export function useTrustGraph() {
  return useQuery({ queryKey: ['reputation', 'trust-graph'], queryFn: reputationApi.trustGraph })
}
