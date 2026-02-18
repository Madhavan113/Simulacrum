import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clawdbotsApi } from '../api/clawdbots'
import type { ClawdbotGoal, ClawdbotMessage, ClawdbotProfile } from '../api/types'
import { PageHeader } from '../components/layout/PageHeader'
import { useClawdbotGoals, useClawdbotStatus, useClawdbots, useClawdbotThread } from '../hooks/useClawdbots'

function BotCard({ bot, goal }: { bot: ClawdbotProfile; goal?: ClawdbotGoal }) {
  return (
    <div
      className="flex flex-col gap-2 p-4"
      style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--bg-surface)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-primary">{bot.name}</span>
        <span
          className="label"
          style={{
            fontSize: 10,
            color: bot.origin === 'community' ? 'var(--accent)' : 'var(--text-muted)',
            border: '1px solid',
            borderColor: bot.origin === 'community' ? 'var(--accent-dim)' : 'var(--border)',
            padding: '1px 6px',
            borderRadius: 3,
          }}
        >
          {bot.origin}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{bot.accountId}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="label" style={{ fontSize: 10 }}>
          Strategy: <span className="text-primary">{bot.strategy}</span>
        </span>
        <span className="label" style={{ fontSize: 10 }}>
          Mode: <span className="text-primary">{bot.mode}</span>
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="label" style={{ fontSize: 10 }}>
          Bankroll: <span className="text-primary">{bot.bankrollHbar} HBAR</span>
        </span>
        <span className="label" style={{ fontSize: 10 }}>
          Rep: <span className="text-primary">{bot.reputationScore.toFixed(2)}</span>
        </span>
      </div>
      {goal && (
        <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--border)' }}>
          <span className="label" style={{ fontSize: 10 }}>
            Goal: <span className="text-primary">{goal.title}</span>
          </span>
          <span
            className="label"
            style={{
              fontSize: 10,
              color: goal.status === 'FAILED' ? '#ff8a80' : goal.status === 'COMPLETED' ? 'var(--accent)' : '#ffd180',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '1px 6px',
            }}
          >
            {goal.status}
          </span>
        </div>
      )}
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

export function Bots() {
  const { data: status } = useClawdbotStatus()
  const { data: bots = [], isLoading } = useClawdbots()
  const { data: thread = [] } = useClawdbotThread()
  const { data: goals = [] } = useClawdbotGoals()
  const communityBots = bots.filter(bot => bot.origin === 'community')
  const activeGoals = goals.filter(goal => goal.status === 'IN_PROGRESS' || goal.status === 'PENDING')
  const goalByBotId = goals.reduce<Record<string, ClawdbotGoal>>((acc, goal) => {
    const current = acc[goal.botId]
    if (!current || Date.parse(goal.updatedAt) > Date.parse(current.updatedAt)) {
      acc[goal.botId] = goal
    }
    return acc
  }, {})

  const queryClient = useQueryClient()
  const startMut = useMutation({ mutationFn: clawdbotsApi.start, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['clawdbots'] }) })
  const stopMut = useMutation({ mutationFn: clawdbotsApi.stop, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['clawdbots'] }) })
  const runNowMut = useMutation({ mutationFn: clawdbotsApi.runNow, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['clawdbots'] }) })
  const runDemoMut = useMutation({
    mutationFn: clawdbotsApi.runDemoTimeline,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['clawdbots'] })
      void queryClient.invalidateQueries({ queryKey: ['markets'] })
    },
  })

  const running = status?.running ?? false
  const mutLoading = startMut.isPending || stopMut.isPending || runNowMut.isPending || runDemoMut.isPending

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
        <button
          onClick={() => runDemoMut.mutate()}
          disabled={mutLoading}
          className="label text-xs px-3 py-1"
          title="Localhost-only backdoor. Requires DEMO_BACKDOOR_ENABLED=true"
          style={{
            background: '#2a2112',
            color: '#ffb74d',
            border: '1px solid #ffb74d',
            borderRadius: 6,
            cursor: mutLoading ? 'wait' : 'pointer',
            opacity: mutLoading ? 0.5 : 1,
          }}
        >
          Run Demo Timeline
        </button>
      </div>
      <div className="px-8 py-2" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        <p className="label text-xs" style={{ color: '#ffb74d' }}>
          DEMO BACKDOOR: localhost only, explicitly marked demo markets/events.
        </p>
      </div>

      {/* Main body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Bot cards grid (60%) */}
        <section className="flex-1 overflow-y-auto px-8 py-6" style={{ borderRight: '1px solid var(--border)' }}>
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <span className="label">Loading…</span>
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
