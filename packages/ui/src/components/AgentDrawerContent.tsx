import type { Agent } from '../api/types'
import { useTrustGraph } from '../hooks/useReputation'
import { HashScanLink } from './HashScanLink'
import { TrustGraphViz } from './TrustGraph'

export function AgentDrawerContent({ agent }: { agent: Agent }) {
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
