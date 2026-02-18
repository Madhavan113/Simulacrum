import { apiFetch } from './client'
import type {
  ClawdbotGoal,
  ClawdbotMessage,
  ClawdbotNetworkStatus,
  ClawdbotProfile,
} from './types'

export const clawdbotsApi = {
  status:  () => apiFetch<ClawdbotNetworkStatus>('/clawdbots/status'),
  bots:    () => apiFetch<{ bots: ClawdbotProfile[] }>('/clawdbots/bots').then(r => r.bots),
  goals:   (botId?: string) => {
    const suffix = botId ? `?botId=${encodeURIComponent(botId)}` : ''
    return apiFetch<{ goals: ClawdbotGoal[] }>(`/clawdbots/goals${suffix}`).then(r => r.goals)
  },
  thread:  (limit = 50) =>
    apiFetch<{ messages: ClawdbotMessage[] }>(`/clawdbots/thread?limit=${limit}`).then(r => r.messages),
  start:   () => apiFetch<ClawdbotNetworkStatus>('/clawdbots/start',   { method: 'POST' }),
  stop:    () => apiFetch<ClawdbotNetworkStatus>('/clawdbots/stop',    { method: 'POST' }),
  runNow:  () => apiFetch<ClawdbotNetworkStatus>('/clawdbots/run-now', { method: 'POST' }),
  runDemoTimeline: () =>
    apiFetch<{
      runId: string
      status: 'started'
      source: 'demo-script'
      demo: true
      warning: string
    }>('/clawdbots/demo/scripted-timeline', { method: 'POST' }),
}
