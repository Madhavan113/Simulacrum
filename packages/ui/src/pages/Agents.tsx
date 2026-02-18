import { useMemo, useState } from 'react'
import type { Agent } from '../api/types'
import { AgentCard } from '../components/AgentCard'
import { AgentDrawerContent } from '../components/AgentDrawerContent'
import { Drawer } from '../components/Drawer'
import { PageHeader } from '../components/layout/PageHeader'
import { SkeletonCard } from '../components/Skeleton'
import { useAgents } from '../hooks/useAgents'
import { useLeaderboard } from '../hooks/useReputation'

export function Agents() {
  const { data: agents = [], isLoading } = useAgents()
  const { data: leaderboard = [] } = useLeaderboard()
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)

  const sorted = useMemo(() => [...agents].sort((a, b) => b.reputationScore - a.reputationScore), [agents])

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <PageHeader title="Agents" meta={`${agents.length} registered`} />

      <div className="flex flex-1 overflow-hidden">
        {/* Agent grid (65%) */}
        <section
          className="flex-1 overflow-y-auto px-8 py-6"
          style={{ borderRight: '1px solid var(--border)' }}
        >
          {isLoading && (
            <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)}
            </div>
          )}
          {!isLoading && agents.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="label">No agents registered</p>
            </div>
          )}
          <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {sorted.map((agent, i) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                rank={i + 1}
                onClick={() => setSelectedAgent(agent)}
              />
            ))}
          </div>
        </section>

        {/* Leaderboard (35%) */}
        <aside className="overflow-y-auto" style={{ width: 280, flexShrink: 0 }}>
          <div
            className="px-5 py-4"
            style={{ borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 1 }}
          >
            <p className="label">Reputation Leaderboard</p>
          </div>
          {leaderboard.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <p className="label">No attestations yet</p>
            </div>
          )}
          {leaderboard.map((entry, i) => (
            <div
              key={entry.accountId}
              className="flex items-center gap-3 px-5 py-3"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <span className="label" style={{ fontSize: 10, color: 'var(--accent)', minWidth: 20 }}>#{i + 1}</span>
              <span className="font-mono text-xs flex-1 truncate" style={{ color: 'var(--text-muted)' }}>
                {entry.accountId}
              </span>
              <span className="font-mono text-xs text-primary">{entry.score.toFixed(1)}</span>
            </div>
          ))}
        </aside>
      </div>

      <Drawer open={Boolean(selectedAgent)} onClose={() => setSelectedAgent(null)}>
        {selectedAgent && <AgentDrawerContent agent={selectedAgent} />}
      </Drawer>
    </div>
  )
}
