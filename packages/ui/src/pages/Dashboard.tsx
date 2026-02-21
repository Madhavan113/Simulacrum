import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clawdbotsApi } from '../api/clawdbots'
import type { WsEvent } from '../api/types'
import { ActivityFeed } from '../components/ActivityFeed'
import { Drawer } from '../components/Drawer'
import { EngineControl } from '../components/EngineControl'
import { MarketCard } from '../components/MarketCard'
import { SkeletonCard } from '../components/Skeleton'
import { ThreadMessage } from '../components/ThreadMessage'
import { Stat, Tabs, Card, EmptyState } from '../components/ui'
import { useClawdbotGoals, useClawdbotStatus, useClawdbotThread } from '../hooks/useClawdbots'
import { useMarketBetsByIds, useMarkets } from '../hooks/useMarkets'
import { useDerivativesOverview } from '../hooks/useDerivatives'
import { useServices } from '../hooks/useServices'
import { MarketDetail } from './MarketDetail'

export function Dashboard() {
  const navigate = useNavigate()
  const { data: markets = [], isLoading } = useMarkets()
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null)
  const [sidebarTab, setSidebarTab] = useState('events')

  const { data: clawdbotStatus } = useClawdbotStatus()
  const { data: thread = [] } = useClawdbotThread()
  const { data: goals = [] } = useClawdbotGoals()
  const { data: derivOverview } = useDerivativesOverview()
  const { data: services = [] } = useServices()

  const queryClient = useQueryClient()
  const clawdbotStart = useMutation({ mutationFn: clawdbotsApi.start, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['clawdbots'] }) })
  const clawdbotStop = useMutation({ mutationFn: clawdbotsApi.stop, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['clawdbots'] }) })

  const open = useMemo(() => markets.filter(m => m.status === 'OPEN'), [markets])
  const resolved = useMemo(() => markets.filter(m => m.status === 'RESOLVED'), [markets])
  const openIds = useMemo(() => open.map(m => m.id), [open])
  const openBetSnapshots = useMarketBetsByIds(openIds)
  const stakeByMarketId: Record<string, Record<string, number>> = {}

  for (const [index, query] of openBetSnapshots.entries()) {
    const marketId = openIds[index]
    if (!marketId || !query.data?.stakeByOutcome) continue
    stakeByMarketId[marketId] = query.data.stakeByOutcome
  }

  const activeGoals = useMemo(() => goals.filter(g => g.status === 'IN_PROGRESS' || g.status === 'PENDING'), [goals])

  const handleEventClick = useCallback((event: WsEvent) => {
    const p = event.payload as Record<string, unknown>
    if (typeof p.marketId === 'string') setSelectedMarketId(p.marketId)
    else if (typeof p.id === 'string' && event.type.startsWith('market')) setSelectedMarketId(p.id)
  }, [])

  const sidebarTabs = [
    { id: 'events', label: 'Live Events' },
    { id: 'thread', label: 'Bot Thread' },
  ]

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Engine controls */}
      <div
        className="flex items-center gap-4 px-6 py-2.5"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}
      >
        <EngineControl
          label="Community ClawDBots"
          running={clawdbotStatus?.running ?? false}
          onStart={() => clawdbotStart.mutate()}
          onStop={() => clawdbotStop.mutate()}
          isLoading={clawdbotStart.isPending || clawdbotStop.isPending}
        />
        <div className="flex-1" />
        <span className="label" style={{ fontSize: 11 }}>{clawdbotStatus?.botCount ?? 0} bots</span>
        <span className="label" style={{ fontSize: 11 }}>{activeGoals.length} goals</span>
      </div>

      {/* Stats band */}
      <div
        className="grid gap-3 px-6 py-4"
        style={{ gridTemplateColumns: 'repeat(6, 1fr)', borderBottom: '1px solid var(--border)' }}
      >
        <Stat label="Open Markets" value={open.length} />
        <Stat label="Total Markets" value={markets.length} />
        <Stat label="Resolved" value={resolved.length} />
        <Stat label="Positions" value={derivOverview?.totalPositions ?? 0} />
        <Stat label="Services" value={services.length} />
        <Stat label="Network" value="Hedera Testnet" />
      </div>


      {/* Main body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Markets + quick links */}
        <section className="flex-1 overflow-y-auto px-6 py-4" style={{ borderRight: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="label">Active Markets</span>
            <button
              onClick={() => navigate('/app/markets')}
              className="label transition-colors duration-150"
              style={{ fontSize: 11, color: 'var(--accent)', cursor: 'pointer', background: 'none', border: 'none' }}
            >
              View All
            </button>
          </div>

          {isLoading && (
            <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)}
            </div>
          )}

          {!isLoading && markets.length === 0 && (
            <EmptyState message="No markets yet" sub="Start the ClawDBot network to generate markets" />
          )}

          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {open.slice(0, 6).map(market => (
              <MarketCard
                key={market.id}
                market={market}
                stakeByOutcome={stakeByMarketId[market.id]}
                onClick={() => setSelectedMarketId(market.id)}
              />
            ))}
          </div>

          {/* Quick summary cards */}
          {(derivOverview || services.length > 0) && (
            <div className="grid gap-3 mt-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {derivOverview && (
                <Card
                  hoverable
                  onClick={() => navigate('/app/markets/derivatives')}
                >
                  <span className="label" style={{ display: 'block', marginBottom: 8 }}>Derivatives</span>
                  <div className="flex items-baseline gap-2">
                    <span style={{ fontSize: 18, fontWeight: 500 }}>{derivOverview.totalPositions}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>positions</span>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>·</span>
                    <span style={{ fontSize: 18, fontWeight: 500 }}>{derivOverview.totalOptions}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>options</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, display: 'block' }}>
                    {derivOverview.totalOpenInterestHbar.toFixed(1)} HBAR open interest
                  </span>
                </Card>
              )}
              {services.length > 0 && (
                <Card
                  hoverable
                  onClick={() => navigate('/app/markets/services')}
                >
                  <span className="label" style={{ display: 'block', marginBottom: 8 }}>Services</span>
                  <div className="flex items-baseline gap-2">
                    <span style={{ fontSize: 18, fontWeight: 500 }}>{services.length}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>registered</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, display: 'block' }}>
                    {services.filter(s => s.status === 'ACTIVE').length} active
                  </span>
                </Card>
              )}
            </div>
          )}
        </section>

        {/* Right: Activity / Thread */}
        <aside style={{ width: 340, flexShrink: 0 }} className="flex flex-col">
          <Tabs
            tabs={sidebarTabs}
            activeId={sidebarTab}
            onChange={setSidebarTab}
            className="px-2"
          />

          <div style={{ display: sidebarTab === 'events' ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <ActivityFeed onEventClick={handleEventClick} className="flex-1 overflow-y-auto" />
          </div>
          <div style={{ display: sidebarTab === 'thread' ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div className="flex-1 overflow-y-auto">
              {thread.length === 0 ? (
                <EmptyState message="No bot messages yet" />
              ) : (
                thread.map(msg => <ThreadMessage key={msg.id} msg={msg} />)
              )}
            </div>
          </div>
        </aside>
      </div>

      <Drawer open={Boolean(selectedMarketId)} onClose={() => setSelectedMarketId(null)}>
        {selectedMarketId && <MarketDetail marketId={selectedMarketId} />}
      </Drawer>
    </div>
  )
}
