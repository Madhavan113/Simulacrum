import { useQuery } from '@tanstack/react-query'
import { autonomyApi } from '../api/autonomy'

export function useAutonomyStatus() {
  return useQuery({
    queryKey: ['autonomy', 'status'],
    queryFn: autonomyApi.status,
    refetchInterval: 10_000,
  })
}
