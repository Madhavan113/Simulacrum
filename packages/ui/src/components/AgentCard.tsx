import type { Agent } from '../api/types'

interface AgentCardProps {
  agent: Agent
  rank?: number
  onClick?: () => void
}

export function AgentCard({ agent, rank, onClick }: AgentCardProps) {
  return (
    <button
      onClick={onClick}
      aria-label={`Agent: ${agent.name}`}
      className="relative overflow-hidden text-left transition-colors"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        cursor: 'pointer',
        width: '100%',
      }}
    >
      <div className="flex flex-col gap-2 p-4">
        {/* Name row */}
        <div className="flex items-center gap-2">
          {rank !== undefined && (
            <span className="label" style={{ fontSize: 10, color: 'var(--accent)' }}>
              #{rank}
            </span>
          )}
          <span className="text-sm font-medium text-primary truncate">{agent.name}</span>
        </div>

        {/* Account ID */}
        <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
          {agent.accountId}
        </span>

        {/* Strategy badge */}
        <span
          className="label"
          style={{
            fontSize: 10,
            background: 'var(--bg-raised)',
            border: '1px solid var(--border)',
            padding: '2px 6px',
            borderRadius: 4,
            display: 'inline-block',
            width: 'fit-content',
          }}
        >
          {agent.strategy}
        </span>

        {/* Rep bar */}
        <div className="flex flex-col gap-1 mt-1">
          <div className="flex items-center justify-between">
            <span className="label" style={{ fontSize: 10 }}>REP</span>
            <span className="font-mono text-xs" style={{ color: 'var(--accent)' }}>
              {agent.reputationScore}
            </span>
          </div>
          <div className="w-full rounded-sm overflow-hidden" style={{ height: 4, background: 'var(--bg-raised)' }}>
            <div
              className="h-full transition-[width]"
              style={{ width: `${agent.reputationScore}%`, background: 'var(--accent-dim)' }}
            />
          </div>
        </div>

        {/* Bankroll */}
        <div className="flex items-center justify-between mt-1">
          <span className="label" style={{ fontSize: 10 }}>BANKROLL</span>
          <span className="font-mono text-xs text-primary">{agent.bankrollHbar.toFixed(2)} ℏ</span>
        </div>
      </div>
    </button>
  )
}
