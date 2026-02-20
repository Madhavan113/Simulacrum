import { adminFetch, apiFetch } from './client'
import type { AutonomyStatus } from './types'

export const autonomyApi = {
  status:  () => apiFetch<AutonomyStatus>('/autonomy/status'),
  start:   () => adminFetch<AutonomyStatus>('/autonomy/start',   { method: 'POST' }),
  stop:    () => adminFetch<AutonomyStatus>('/autonomy/stop',    { method: 'POST' }),
  runNow:  () => adminFetch<AutonomyStatus>('/autonomy/run-now', { method: 'POST' }),
}
