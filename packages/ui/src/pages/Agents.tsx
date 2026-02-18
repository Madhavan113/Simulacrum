import { useState } from 'react'
import type { Agent } from '../api/types'
import { AgentCard } from '../components/AgentCard'
import { Drawer } from '../components/Drawer'
import { HashScanLink } from '../components/HashScanLink'
import { TrustGraphViz } from '../components/TrustGraph'
import { PageHeader } from '../components/layout/PageHeader'
import { useAgents } from '../hooks/useAgents'
import { useLeaderboard, useTrustGraph } from '../hooks/useReputation'

function AgentDrawerContent({ agent }: { agent: Agent }) {
  const { data: graph } = useTrustGraph()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="px-6 py-6 shrink-0"
        style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border)', minHeight: 100 }}
      >
        <p className="label mb-1">{agent.accountId}</p>
        <h2 className="text-primary font-light" style={{ fontSize: 24 }}>{agent.name}</h2>
        <span
          className="label mt-2 inline-block"
          style={{
            fontSize: 10,
            background: 'var(--bg-raised)',
            border: '1px solid var(--border)',
            padding: '2px 8px',
            borderRadius: 4,
          }}
        >
          {agent.strategy}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Stats */}
        <section className="px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="label mb-3">Stats</p>
          <div className="flex flex-col gap-3">
            <div className="flex justify-between">
              <span className="label" style={{ fontSize: 10 }}>Reputation</span>
              <span className="font-mono text-xs text-primary">{agent.reputationScore} / 100</span>
            </div>
            <div
              className="w-full overflow-hidden rounded-sm"
              style={{ height: 6, background: 'var(--bg-raised)' }}
            >
              <div
                style={{ width: `${agent.reputationScore}%`, height: '100%', background: 'var(--accent-dim)' }}
              />
            </div>
            <div className="flex justify-between">
              <span className="label" style={{ fontSize: 10 }}>Bankroll</span>
              <span className="font-mono text-xs text-primary">{agent.bankrollHbar.toFixed(4)} ℏ</span>
            </div>
          </div>
        </section>

        {/* Trust graph */}
        {graph && graph.nodes.length > 0 && (
          <section className="px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="label mb-3">Trust Graph</p>
            <TrustGraphViz graph={graph} width={400} height={240} />
          </section>
        )}

        {/* On-chain */}
        <section
          className="px-6 py-5"
          style={{ background: 'var(--bg-raised)' }}
        >
          <p className="label mb-3">On-Chain</p>
          <div className="flex items-center justify-between">
            <span className="label" style={{ fontSize: 10 }}>Account ID</span>
            <HashScanLink
              id={agent.accountId}
              url={`https://hashscan.io/testnet/account/${agent.accountId}`}
            />
          </div>
        </section>
      </div>
    </div>
  )
}

export function Agents() {
  const { data: agents = [], isLoading } = useAgents()
  const { data: leaderboard = [] } = useLeaderboard()
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)

  const sorted = [...agents].sort((a, b) => b.reputationScore - a.reputationScore)

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
            <div className="flex items-center justify-center py-16">
              <span className="label">Loading…</span>
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
