import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { clawdbotsApi } from '../api/clawdbots'
import type { ClawdbotGoal } from '../api/types'
import { BotCard } from '../components/BotCard'
import { PageHeader } from '../components/layout/PageHeader'
import { SkeletonCard } from '../components/Skeleton'
import { ThreadMessage } from '../components/ThreadMessage'
import { useClawdbotGoals, useClawdbotStatus, useClawdbots, useClawdbotThread } from '../hooks/useClawdbots'

export function Bots() {
  const { data: status } = useClawdbotStatus()
  const { data: bots = [], isLoading } = useClawdbots()
  const { data: thread = [] } = useClawdbotThread()
  const { data: goals = [] } = useClawdbotGoals()
  const communityBots = useMemo(() => bots.filter(bot => bot.origin === 'community'), [bots])
  const activeGoals = useMemo(() => goals.filter(goal => goal.status === 'IN_PROGRESS' || goal.status === 'PENDING'), [goals])
  const goalByBotId = useMemo(() => goals.reduce<Record<string, ClawdbotGoal>>((acc, goal) => {
    const current = acc[goal.botId]
    if (!current || Date.parse(goal.updatedAt) > Date.parse(current.updatedAt)) {
      acc[goal.botId] = goal
    }
    return acc
  }, {}), [goals])

  const queryClient = useQueryClient()
  const startMut = useMutation({ mutationFn: clawdbotsApi.start, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['clawdbots'] }) })
  const stopMut = useMutation({ mutationFn: clawdbotsApi.stop, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['clawdbots'] }) })
  const runNowMut = useMutation({ mutationFn: clawdbotsApi.runNow, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['clawdbots'] }) })
  const running = status?.running ?? false
  const mutLoading = startMut.isPending || stopMut.isPending || runNowMut.isPending

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <PageHeader title="Community ClawDBots" meta={`${bots.length} registered`} />

      {/* Status bar */}
      <div
        className="flex items-center gap-4 px-8 py-3"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-raised)' }}
      >
        <span
          style={{
            width: 8, height: 8, borderRadius: '50%',
            background: running ? 'var(--accent)' : 'var(--text-dim)',
            flexShrink: 0,
          }}
        />
        <span className="label text-xs">{running ? 'Running' : 'Stopped'}</span>
        {status && (
          <>
            <span className="label text-xs" style={{ color: 'var(--text-muted)' }}>
              {status.botCount} total bots
            </span>
            <span className="label text-xs" style={{ color: 'var(--text-muted)' }}>
              {communityBots.length} community bots
            </span>
            <span className="label text-xs" style={{ color: 'var(--text-muted)' }}>
              {activeGoals.length} active goals
            </span>
            <span className="label text-xs" style={{ color: 'var(--text-muted)' }}>
              {status.openMarkets} open markets
            </span>
            <span className="label text-xs" style={{ color: 'var(--text-muted)' }}>
              {status.tickCount} ticks
            </span>
          </>
        )}
        <div className="flex-1" />
        <button
          onClick={() => (running ? stopMut : startMut).mutate()}
          disabled={mutLoading}
          className="label text-xs px-3 py-1"
          style={{
            background: running ? 'var(--bg-surface)' : 'var(--accent-dim)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            cursor: mutLoading ? 'wait' : 'pointer',
            opacity: mutLoading ? 0.5 : 1,
          }}
        >
          {running ? 'Stop' : 'Start'}
        </button>
        <button
          onClick={() => runNowMut.mutate()}
          disabled={mutLoading || !running}
          className="label text-xs px-3 py-1"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            cursor: mutLoading || !running ? 'not-allowed' : 'pointer',
            opacity: mutLoading || !running ? 0.5 : 1,
          }}
        >
          Run Now
        </button>
      </div>

      {/* Main body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Bot cards grid (60%) */}
        <section className="flex-1 overflow-y-auto px-8 py-6" style={{ borderRight: '1px solid var(--border)' }}>
          {isLoading && (
            <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)}
            </div>
          )}
          {!isLoading && bots.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="label">No bots registered yet</p>
            </div>
          )}
          <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {bots.map(bot => <BotCard key={bot.id} bot={bot} goal={goalByBotId[bot.id]} />)}
          </div>
        </section>

        {/* Message thread (40%) */}
        <aside style={{ width: 360, flexShrink: 0 }} className="flex flex-col">
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="label">Bot Thread</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {thread.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <p className="label">No messages yet</p>
              </div>
            ) : (
              thread.map(msg => <ThreadMessage key={msg.id} msg={msg} />)
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
