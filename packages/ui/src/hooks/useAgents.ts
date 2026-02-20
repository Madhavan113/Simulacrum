import { useQuery } from '@tanstack/react-query'
import { agentsApi } from '../api/agents'

export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: agentsApi.list,
    refetchInterval: 15_000,
    staleTime: 10_000,
  })
}
