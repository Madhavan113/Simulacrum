import { adminFetch, apiFetch } from './client'
import type {
  ResearchEngineStatus,
  ResearchPublication,
  PublicationEvaluation,
  ResearchObservation,
  ResearchAgentProfile,
} from '@simulacrum/types'

export const researchApi = {
  status: () =>
    apiFetch<ResearchEngineStatus>('/research/status'),

  publications: (params?: { status?: string; focusArea?: string; agentId?: string }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.focusArea) qs.set('focusArea', params.focusArea)
    if (params?.agentId) qs.set('agentId', params.agentId)
    const query = qs.toString()
    return apiFetch<{ publications: ResearchPublication[] }>(
      `/research/publications${query ? `?${query}` : ''}`
    ).then((r) => r.publications)
  },

  publication: (id: string) =>
    apiFetch<{ publication: ResearchPublication; evaluation?: PublicationEvaluation }>(
      `/research/publications/${id}`
    ),

  observations: (params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return apiFetch<{ observations: ResearchObservation[]; total: number }>(
      `/research/observations${query ? `?${query}` : ''}`
    )
  },

  agents: () =>
    apiFetch<{ agents: ResearchAgentProfile[] }>('/research/agents').then((r) => r.agents),

  start: () =>
    adminFetch<ResearchEngineStatus>('/research/start', { method: 'POST' }),

  stop: () =>
    adminFetch<ResearchEngineStatus>('/research/stop', { method: 'POST' }),

  runNow: () =>
    adminFetch<ResearchEngineStatus>('/research/run-now', { method: 'POST' }),
}
