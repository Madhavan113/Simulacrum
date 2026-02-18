import type { ClawdbotGoal, ClawdbotProfile } from '../api/types'

export function BotCard({ bot, goal }: { bot: ClawdbotProfile; goal?: ClawdbotGoal }) {
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
