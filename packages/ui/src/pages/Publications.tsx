import { useState } from 'react'
import { EngineControl } from '../components/EngineControl'
import { PublicationCard } from '../components/PublicationCard'
import { PublicationDetail } from '../components/PublicationDetail'
import { ResearchAgentCard } from '../components/ResearchAgentCard'
import { ObservationFeed } from '../components/ObservationFeed'
import {
  useResearchStatus,
  usePublications,
  usePublication,
  useResearchAgents,
  useResearchObservations,
  useResearchStart,
  useResearchStop,
  useResearchRunNow,
} from '../hooks/useResearch'

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="flex flex-col gap-1 px-4 py-3"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10 }}
    >
      <span className="label" style={{ fontSize: 10, color: 'var(--text-dim)' }}>{label}</span>
      <span className="font-mono text-lg font-semibold text-primary">{value}</span>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            height: 120,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            opacity: 0.5,
          }}
        />
      ))}
    </div>
  )
}

export function Publications() {
  const { data: status, isLoading: statusLoading, error: statusError } = useResearchStatus()
  const { data: publications, isLoading: pubsLoading } = usePublications()
  const { data: agents } = useResearchAgents()
  const { data: obsData } = useResearchObservations(50)
  const startMutation = useResearchStart()
  const stopMutation = useResearchStop()
  const runNowMutation = useResearchRunNow()

  const [selectedPubId, setSelectedPubId] = useState<string | null>(null)
  const { data: selectedPubData } = usePublication(selectedPubId ?? undefined)
  const [statusFilter, setStatusFilter] = useState<string>('')

  const filteredPubs = publications?.filter((p) =>
    !statusFilter || p.status === statusFilter
  ) ?? []

  if (statusError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12">
        <p className="text-sm" style={{ color: '#e74c3c' }}>
          Failed to connect to the research engine.
        </p>
        <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
          {statusError instanceof Error ? statusError.message : 'Check that the API server is running.'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6" style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-primary">Research Publications</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Deep-research agents observe market behavior and produce autonomous publications with self-evaluation.
        </p>
      </div>

      {/* Engine control */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <EngineControl
            label={
              statusLoading
                ? 'Research Engine · loading…'
                : `Research Engine · Tick ${status?.tickCount ?? 0} · ${status?.agentCount ?? 0} agents`
            }
            running={status?.running ?? false}
            onStart={() => startMutation.mutate()}
            onStop={() => stopMutation.mutate()}
            isLoading={startMutation.isPending || stopMutation.isPending}
          />
        </div>
        {status?.running && (
          <button
            onClick={() => runNowMutation.mutate()}
            disabled={runNowMutation.isPending}
            className="label text-xs px-3 py-2"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              cursor: runNowMutation.isPending ? 'wait' : 'pointer',
              opacity: runNowMutation.isPending ? 0.5 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            Run Now
          </button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Publications" value={status?.totalPublications ?? 0} />
        <StatTile label="Published" value={status?.publishedCount ?? 0} />
        <StatTile label="Avg Score" value={status?.averageEvalScore ?? '—'} />
        <StatTile label="Observations" value={status?.totalObservations ?? 0} />
      </div>

      {status?.lastError && (
        <div
          className="px-4 py-2 text-xs"
          style={{ background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.2)', borderRadius: 8, color: '#e74c3c' }}
        >
          Last error: {status.lastError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main: publications grid */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="label text-xs">Filter:</span>
            {['', 'PUBLISHED', 'RETRACTED', 'EVALUATING', 'DRAFTING'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="label text-xs px-2 py-1"
                style={{
                  borderRadius: 4,
                  background: statusFilter === s ? 'var(--accent-dim)' : 'var(--bg-raised)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  opacity: statusFilter === s ? 1 : 0.6,
                }}
              >
                {s || 'All'}
              </button>
            ))}
          </div>

          {pubsLoading ? (
            <LoadingSkeleton />
          ) : filteredPubs.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-dim)', padding: '32px 0', textAlign: 'center' }}>
              {status?.running
                ? 'Research agents are collecting data. Publications will appear as they are produced.'
                : 'Start the research engine to begin producing publications.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredPubs.map((pub) => (
                <PublicationCard
                  key={pub.id}
                  publication={pub}
                  onClick={() => setSelectedPubId(pub.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Sidebar: agents + observations */}
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="label text-xs mb-2" style={{ color: 'var(--text-dim)' }}>RESEARCH AGENTS</h2>
            <div className="flex flex-col gap-2">
              {(agents ?? []).map((agent) => (
                <ResearchAgentCard key={agent.id} agent={agent} />
              ))}
              {(!agents || agents.length === 0) && (
                <p className="text-xs" style={{ color: 'var(--text-dim)', padding: 12 }}>
                  {status?.running ? 'Initializing…' : 'Start the engine to create agents.'}
                </p>
              )}
            </div>
          </div>

          <div>
            <h2 className="label text-xs mb-2" style={{ color: 'var(--text-dim)' }}>OBSERVATION FEED</h2>
            <div
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              <ObservationFeed observations={obsData?.observations ?? []} />
            </div>
          </div>
        </div>
      </div>

      {/* Detail drawer */}
      {selectedPubData?.publication && (
        <PublicationDetail
          publication={selectedPubData.publication}
          onClose={() => setSelectedPubId(null)}
        />
      )}
    </div>
  )
}
