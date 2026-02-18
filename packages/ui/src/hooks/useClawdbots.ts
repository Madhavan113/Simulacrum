import { useQuery } from '@tanstack/react-query'
import { clawdbotsApi } from '../api/clawdbots'

export function useClawdbotStatus() {
  return useQuery({
    queryKey: ['clawdbots', 'status'],
    queryFn: clawdbotsApi.status,
    refetchInterval: 10_000,
  })
}

export function useClawdbots() {
  return useQuery({
    queryKey: ['clawdbots', 'bots'],
    queryFn: clawdbotsApi.bots,
  })
}

export function useClawdbotThread(limit = 50) {
  return useQuery({
    queryKey: ['clawdbots', 'thread', limit],
    queryFn: () => clawdbotsApi.thread(limit),
    refetchInterval: 5_000,
  })
}

export function useClawdbotGoals(botId?: string) {
  return useQuery({
    queryKey: ['clawdbots', 'goals', botId ?? 'all'],
    queryFn: () => clawdbotsApi.goals(botId),
    refetchInterval: 5_000,
  })
}
