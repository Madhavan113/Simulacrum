import { useMemo, useState } from 'react'
import { EmptyState } from '../../components/ui'
import { ServiceCard } from '../../components/services/ServiceCard'
import { ServiceRequestRow } from '../../components/services/ServiceRequestRow'
import { useServices, useServiceRequests } from '../../hooks/useServices'
import { useClawdbots } from '../../hooks/useClawdbots'
import type { ServiceCategory } from '../../api/services'

const CATEGORIES: Array<ServiceCategory | 'ALL'> = ['ALL', 'COMPUTE', 'DATA', 'RESEARCH', 'ANALYSIS', 'ORACLE', 'CUSTOM']

export function ServicesTab() {
  const [category, setCategory] = useState<ServiceCategory | 'ALL'>('ALL')
  const [view, setView] = useState<'catalog' | 'requests'>('catalog')
  const { data: services = [] } = useServices()
  const { data: requests = [] } = useServiceRequests()
  const { data: bots = [] } = useClawdbots()

  const agentNames = useMemo(() => {
    const map: Record<string, string> = {}
    for (const b of bots) map[b.accountId] = b.name
    return map
  }, [bots])

  const filtered = category === 'ALL' ? services : services.filter(s => s.category === category)

  return (
    <>
      <div className="flex items-center gap-2 px-8 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={() => setView('catalog')}
          className="label transition-colors duration-150"
          style={{
            fontSize: 11,
            padding: '3px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid',
            cursor: 'pointer',
            background: view === 'catalog' ? 'var(--accent-dim)' : 'transparent',
            borderColor: view === 'catalog' ? 'var(--accent)' : 'var(--border)',
            color: view === 'catalog' ? 'var(--accent)' : 'var(--text-muted)',
          }}
        >
          Catalog
        </button>
        <button
          onClick={() => setView('requests')}
          className="label transition-colors duration-150"
          style={{
            fontSize: 11,
            padding: '3px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid',
            cursor: 'pointer',
            background: view === 'requests' ? 'var(--accent-dim)' : 'transparent',
            borderColor: view === 'requests' ? 'var(--accent)' : 'var(--border)',
            color: view === 'requests' ? 'var(--accent)' : 'var(--text-muted)',
          }}
        >
          Requests
        </button>

        {view === 'catalog' && (
          <>
            <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
            {CATEGORIES.map(c => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className="label transition-colors duration-150"
                style={{
                  fontSize: 10,
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid',
                  cursor: 'pointer',
                  background: category === c ? 'var(--bg-raised)' : 'transparent',
                  borderColor: category === c ? 'var(--border)' : 'transparent',
                  color: category === c ? 'var(--text-primary)' : 'var(--text-dim)',
                }}
              >
                {c}
              </button>
            ))}
          </>
        )}

        <span className="ml-auto label">
          {view === 'catalog' ? `${filtered.length} services` : `${requests.length} requests`}
        </span>
      </div>

      {view === 'catalog' && (
        <>
          {filtered.length === 0 ? (
            <EmptyState message="No services available" sub="Services will appear here when agents register offerings" />
          ) : (
            <div className="grid gap-3 p-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
              {filtered.map(s => <ServiceCard key={s.id} service={s} providerName={agentNames[s.providerAccountId]} />)}
            </div>
          )}
        </>
      )}

      {view === 'requests' && (
        <>
          {requests.length === 0 ? (
            <EmptyState message="No service requests" sub="Requests will appear here when agents request services" />
          ) : (
            <div className="flex flex-col">
              <div
                className="grid px-4 py-2"
                style={{
                  gridTemplateColumns: '1fr 100px 120px 90px 120px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                {['Service', 'Status', 'Requester', 'Price', 'Created'].map(h => (
                  <span key={h} className="label" style={{ fontSize: 10 }}>{h}</span>
                ))}
              </div>
              {requests.map(r => <ServiceRequestRow key={r.id} request={r} />)}
            </div>
          )}
        </>
      )}
    </>
  )
}
