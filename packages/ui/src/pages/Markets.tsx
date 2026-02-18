import { useState } from 'react'
import type { MarketStatus } from '../api/types'
import { Drawer } from '../components/Drawer'
import { PageHeader } from '../components/layout/PageHeader'
import { MarketCard } from '../components/MarketCard'
import { useMarkets } from '../hooks/useMarkets'
import { MarketDetail } from './MarketDetail'

const STATUS_FILTERS: Array<MarketStatus | 'ALL'> = ['ALL', 'OPEN', 'RESOLVED', 'CLOSED', 'DISPUTED']

export function Markets() {
  const { data: markets = [], isLoading } = useMarkets()
  const [filter, setFilter] = useState<MarketStatus | 'ALL'>('ALL')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filtered = filter === 'ALL' ? markets : markets.filter(m => m.status === filter)

  return (
    <div className="flex flex-col min-h-screen">
      <PageHeader title="Markets" meta={`${markets.length} total`} />

      {/* Filter bar */}
      <div
        className="flex items-center gap-2 px-8 py-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className="label transition-colors"
            style={{
              fontSize: 11,
              padding: '3px 10px',
              borderRadius: 4,
              border: '1px solid',
              cursor: 'pointer',
              background: filter === s ? 'var(--accent-dim)' : 'transparent',
              borderColor: filter === s ? 'var(--accent)' : 'var(--border)',
              color: filter === s ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            {s}
          </button>
        ))}
        <span className="ml-auto label">{filtered.length} shown</span>
      </div>

      {/* Table-style list */}
      <div className="flex flex-col flex-1">
        {/* Column headers */}
        <div
          className="grid px-4 py-2"
          style={{
            gridTemplateColumns: '1fr 100px 120px 140px 100px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {['Question', 'Status', 'Odds', 'Creator', 'Resolves'].map(h => (
            <span key={h} className="label" style={{ fontSize: 10 }}>{h}</span>
          ))}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <span className="label">Loading…</span>
          </div>
        )}

        {filtered.map(market => (
          <MarketCard
            key={market.id}
            market={market}
            volumeNorm={0.5}
            horizontal
            onClick={() => setSelectedId(market.id)}
          />
        ))}

        {!isLoading && filtered.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <span className="label">No markets match filter</span>
          </div>
        )}
      </div>

      <Drawer open={Boolean(selectedId)} onClose={() => setSelectedId(null)}>
        {selectedId && <MarketDetail marketId={selectedId} />}
      </Drawer>
    </div>
  )
}
