import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { clawdbotsApi } from '../api/clawdbots'
import type { ClawdbotMessage, WsEvent } from '../api/types'
import { ActivityFeed } from '../components/ActivityFeed'
import { Drawer } from '../components/Drawer'
import { MarketCard } from '../components/MarketCard'
import { useClawdbotGoals, useClawdbotStatus, useClawdbotThread } from '../hooks/useClawdbots'
import { useMarkets } from '../hooks/useMarkets'
import { MarketDetail } from './MarketDetail'

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="flex flex-col gap-1 p-4"
      style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--bg-surface)' }}
    >
      <span className="label">{label}</span>
      <span className="text-2xl font-light text-primary" style={{ letterSpacing: -1 }}>{value}</span>
    </div>
  )
}

function EngineControl({
  label,
  running,
  onStart,
  onStop,
  isLoading,
}: {
  label: string
  running: boolean
  onStart: () => void
  onStop: () => void
  isLoading: boolean
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <span
        style={{
          width: 8, height: 8, borderRadius: '50%',
          background: running ? 'var(--accent)' : 'var(--text-dim)',
          flexShrink: 0,
        }}
      />
      <span className="label text-xs flex-1">{label}</span>
      <button
        onClick={running ? onStop : onStart}
        disabled={isLoading}
        className="label text-xs px-3 py-1"
        style={{
          background: running ? 'var(--bg-raised)' : 'var(--accent-dim)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          cursor: isLoading ? 'wait' : 'pointer',
          opacity: isLoading ? 0.5 : 1,
        }}
      >
        {running ? 'Stop' : 'Start'}
      </button>
    </div>
  )
}

function ThreadMessage({ msg }: { msg: ClawdbotMessage }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2">
        {msg.botName && (
          <span className="label text-xs" style={{ color: 'var(--accent)' }}>{msg.botName}</span>
        )}
        <span className="font-mono text-xs" style={{ color: 'var(--text-dim)' }}>
          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{msg.text}</span>
    </div>
  )
}

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

  const open = markets.filter(m => m.status === 'OPEN')
  const resolved = markets.filter(m => m.status === 'RESOLVED')
  const hasDemoMarkets = markets.some(m => m.question.startsWith('[DEMO]'))
  const activeGoals = goals.filter(g => g.status === 'IN_PROGRESS' || g.status === 'PENDING')

  function handleEventClick(event: WsEvent) {
    const p = event.payload as Record<string, unknown>
    if (typeof p.marketId === 'string') setSelectedMarketId(p.marketId)
    else if (typeof p.id === 'string' && event.type.startsWith('market')) setSelectedMarketId(p.id)
  }

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
            <div className="flex items-center justify-center py-16">
              <span className="label">Loading…</span>
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
                onClick={() => setSelectedMarketId(market.id)}
              />
            ))}
          </div>
        </section>

        {/* Activity feed / Bot thread (40%) */}
        <aside style={{ width: 360, flexShrink: 0 }} className="flex flex-col">
          <div className="flex items-center gap-0 px-2 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <button
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
