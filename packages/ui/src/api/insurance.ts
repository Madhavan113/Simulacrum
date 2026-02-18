import { apiFetch } from './client'
import type { InsurancePolicy, InsurancePool } from './types'

export const insuranceApi = {
  policies: () => apiFetch<{ policies: InsurancePolicy[] }>('/insurance/policies').then(r => r.policies),
  pools:    () => apiFetch<{ pools: InsurancePool[] }>('/insurance/pools').then(r => r.pools),
}
