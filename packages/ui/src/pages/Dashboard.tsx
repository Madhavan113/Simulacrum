import { useState } from 'react'
import type { WsEvent } from '../api/types'
import { ActivityFeed } from '../components/ActivityFeed'
import { Drawer } from '../components/Drawer'
import { DitherPanel } from '../components/dither/DitherPanel'
import { MarketCard } from '../components/MarketCard'
import { useMarkets } from '../hooks/useMarkets'
import { MarketDetail } from './MarketDetail'

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="relative flex flex-col gap-1 p-4 overflow-hidden"
      style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--bg-surface)' }}
    >
      <DitherPanel pattern="hatch" intensity={0.08} className="absolute inset-0" />
      <span className="label relative z-10">{label}</span>
      <span className="relative z-10 text-2xl font-light text-primary" style={{ letterSpacing: -1 }}>{value}</span>
    </div>
  )
}

export function Dashboard() {
  const { data: markets = [], isLoading } = useMarkets()
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null)

  const open = markets.filter(m => m.status === 'OPEN')
  const resolved = markets.filter(m => m.status === 'RESOLVED')

  function handleEventClick(event: WsEvent) {
    const p = event.payload as Record<string, unknown>
    if (typeof p.marketId === 'string') setSelectedMarketId(p.marketId)
    else if (typeof p.id === 'string' && event.type.startsWith('market')) setSelectedMarketId(p.id)
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Stats band */}
      <div
        className="grid gap-4 px-8 py-6"
        style={{ gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid var(--border)' }}
      >
        <StatTile label="Open Markets" value={open.length} />
        <StatTile label="Total Markets" value={markets.length} />
        <StatTile label="Resolved" value={resolved.length} />
        <StatTile label="Network" value="Hedera Testnet" />
      </div>

      {/* Main body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Markets grid (60%) */}
        <section className="flex-1 overflow-y-auto px-8 py-6" style={{ borderRight: '1px solid var(--border)' }}>
          <p className="label mb-4">Active Markets</p>
          {isLoading && (
            <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  style={{ height: 140, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)' }}
                >
                  <DitherPanel pattern="bayer4" intensity={0.15} width="100%" height="100%" />
                </div>
              ))}
            </div>
          )}
          {!isLoading && markets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <DitherPanel pattern="plus" intensity={0.3} width={120} height={80} className="mb-4" />
              <p className="label">No markets yet</p>
            </div>
          )}
          <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {open.map(market => (
              <MarketCard
                key={market.id}
                market={market}
                volumeNorm={0.5}
                onClick={() => setSelectedMarketId(market.id)}
              />
            ))}
          </div>
        </section>

        {/* Activity feed (40%) */}
        <aside style={{ width: 360, flexShrink: 0 }}>
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="label">Live Activity</p>
          </div>
          <ActivityFeed onEventClick={handleEventClick} className="flex-1 overflow-y-auto" />
        </aside>
      </div>

      {/* Market detail drawer */}
      <Drawer open={Boolean(selectedMarketId)} onClose={() => setSelectedMarketId(null)}>
        {selectedMarketId && <MarketDetail marketId={selectedMarketId} />}
      </Drawer>
    </div>
  )
}
