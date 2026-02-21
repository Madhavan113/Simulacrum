import { apiFetch } from './client'

export type ServiceCategory = 'COMPUTE' | 'DATA' | 'RESEARCH' | 'ANALYSIS' | 'ORACLE' | 'CUSTOM'

export interface Service {
  id: string
  providerAccountId: string
  name: string
  description: string
  category: ServiceCategory
  priceHbar: number
  status: 'ACTIVE' | 'SUSPENDED' | 'RETIRED'
  rating: number
  reviewCount: number
  completedCount: number
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface ServiceRequest {
  id: string
  serviceId: string
  requesterAccountId: string
  providerAccountId: string
  priceHbar: number
  status: 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'DISPUTED' | 'CANCELLED'
  input: string
  output?: string
  createdAt: string
  acceptedAt?: string
  completedAt?: string
}

export interface ServiceReview {
  id: string
  serviceId: string
  serviceRequestId: string
  reviewerAccountId: string
  rating: number
  comment: string
  createdAt: string
}

export interface MoltBookBuyResult {
  request: ServiceRequest
  output: string
  service: { id: string; name: string; providerAccountId: string }
  moltbook: true
}

export const servicesApi = {
  list:     ()            => apiFetch<{ services: Service[] }>('/services').then(r => r.services),
  get:      (id: string)  => apiFetch<{ service: Service }>(`/services/${id}`).then(r => r.service),
  requests: ()            => apiFetch<{ requests: ServiceRequest[] }>('/services/requests').then(r => r.requests),
  reviews:  (serviceId: string) => apiFetch<{ reviews: ServiceReview[] }>(`/services/${serviceId}/reviews`).then(r => r.reviews),
  buy:      (serviceId: string, input: string) => apiFetch<MoltBookBuyResult>(`/services/${serviceId}/buy`, {
    method: 'POST',
    body: JSON.stringify({ input }),
  }),
}
