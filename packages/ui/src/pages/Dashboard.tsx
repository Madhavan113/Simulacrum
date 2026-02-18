import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { clawdbotsApi } from '../api/clawdbots'
import type { WsEvent } from '../api/types'
import { ActivityFeed } from '../components/ActivityFeed'
import { Drawer } from '../components/Drawer'
import { EngineControl } from '../components/EngineControl'
import { MarketCard } from '../components/MarketCard'
import { SkeletonCard } from '../components/Skeleton'
import { StatTile } from '../components/StatTile'
import { ThreadMessage } from '../components/ThreadMessage'
import { useClawdbotGoals, useClawdbotStatus, useClawdbotThread } from '../hooks/useClawdbots'
import { useMarketBetsByIds, useMarkets } from '../hooks/useMarkets'
import { MarketDetail } from './MarketDetail'

export function Dashboard() {
  const { data: markets = [], isLoading } = useMarkets()
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null)
  const [sidebarTab, setSidebarTab] = useState<'events' | 'thread'>('events')

  // Engine status
  const { data: clawdbotStatus } = useClawdbotStatus()
  const { data: thread = [] } = useClawdbotThread()
  const { data: goals = [] } = useClawdbotGoals()

  const queryClient = useQueryClient()

  // ClawDBot mutations
  const clawdbotStart = useMutation({ mutationFn: clawdbotsApi.start, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['clawdbots'] }) })
  const clawdbotStop = useMutation({ mutationFn: clawdbotsApi.stop, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['clawdbots'] }) })

  const open = useMemo(() => markets.filter(m => m.status === 'OPEN'), [markets])
  const resolved = useMemo(() => markets.filter(m => m.status === 'RESOLVED'), [markets])
  const openIds = useMemo(() => open.map(m => m.id), [open])
  const openBetSnapshots = useMarketBetsByIds(openIds)
  const stakeByMarketId: Record<string, Record<string, number>> = {}

  for (const [index, query] of openBetSnapshots.entries()) {
    const marketId = openIds[index]
    if (!marketId || !query.data?.stakeByOutcome) {
      continue
    }
    stakeByMarketId[marketId] = query.data.stakeByOutcome
  }

  const hasDemoMarkets = useMemo(() => markets.some(m => m.question.startsWith('[DEMO]')), [markets])
  const activeGoals = useMemo(() => goals.filter(g => g.status === 'IN_PROGRESS' || g.status === 'PENDING'), [goals])

  const handleEventClick = useCallback((event: WsEvent) => {
    const p = event.payload as Record<string, unknown>
    if (typeof p.marketId === 'string') setSelectedMarketId(p.marketId)
    else if (typeof p.id === 'string' && event.type.startsWith('market')) setSelectedMarketId(p.id)
  }, [])

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Engine controls band */}
      <div
        className="flex items-center gap-4 px-8 py-3"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-raised)' }}
      >
        <EngineControl
          label="Community ClawDBots"
          running={clawdbotStatus?.running ?? false}
          onStart={() => clawdbotStart.mutate()}
          onStop={() => clawdbotStop.mutate()}
          isLoading={clawdbotStart.isPending || clawdbotStop.isPending}
        />
        <div className="flex-1" />
        <span className="label text-xs" style={{ color: 'var(--text-muted)' }}>
          {clawdbotStatus?.botCount ?? 0} community bots
        </span>
        <span className="label text-xs" style={{ color: 'var(--text-muted)' }}>
          {clawdbotStatus?.openMarkets ?? open.length} open markets
        </span>
        <span className="label text-xs" style={{ color: 'var(--text-muted)' }}>
          {activeGoals.length} active goals
        </span>
        {(hasDemoMarkets || clawdbotStatus?.demoScriptRunning) && (
          <span
            className="label text-xs px-2 py-1"
            style={{
              color: '#ffb74d',
              border: '1px solid #ffb74d',
              borderRadius: 6,
            }}
          >
            DEMO DATA
          </span>
        )}
      </div>

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
              {Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)}
            </div>
          )}
          {!isLoading && markets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="label">No markets yet</p>
            </div>
          )}
          <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {open.map(market => (
              <MarketCard
                key={market.id}
                market={market}
                stakeByOutcome={stakeByMarketId[market.id]}
                onClick={() => setSelectedMarketId(market.id)}
              />
            ))}
          </div>
        </section>

        {/* Activity feed / Bot thread (40%) */}
        <aside style={{ width: 360, flexShrink: 0 }} className="flex flex-col">
          <div role="tablist" className="flex items-center gap-0 px-2 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <button
              role="tab"
              aria-selected={sidebarTab === 'events'}
              onClick={() => setSidebarTab('events')}
              className="label text-xs px-4 py-1.5"
              style={{
                background: sidebarTab === 'events' ? 'var(--bg-raised)' : 'transparent',
                border: '1px solid',
                borderColor: sidebarTab === 'events' ? 'var(--border)' : 'transparent',
                borderRadius: 6,
                cursor: 'pointer',
                color: sidebarTab === 'events' ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              Live Events
            </button>
            <button
              role="tab"
              aria-selected={sidebarTab === 'thread'}
              onClick={() => setSidebarTab('thread')}
              className="label text-xs px-4 py-1.5"
              style={{
                background: sidebarTab === 'thread' ? 'var(--bg-raised)' : 'transparent',
                border: '1px solid',
                borderColor: sidebarTab === 'thread' ? 'var(--border)' : 'transparent',
                borderRadius: 6,
                cursor: 'pointer',
                color: sidebarTab === 'thread' ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              Bot Thread
            </button>
          </div>

          {sidebarTab === 'events' ? (
            <ActivityFeed onEventClick={handleEventClick} className="flex-1 overflow-y-auto" />
          ) : (
            <div className="flex-1 overflow-y-auto">
              {thread.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <p className="label">No bot messages yet</p>
                </div>
              ) : (
                thread.map(msg => <ThreadMessage key={msg.id} msg={msg} />)
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Market detail drawer */}
      <Drawer open={Boolean(selectedMarketId)} onClose={() => setSelectedMarketId(null)}>
        {selectedMarketId && <MarketDetail marketId={selectedMarketId} />}
      </Drawer>
    </div>
  )
}
