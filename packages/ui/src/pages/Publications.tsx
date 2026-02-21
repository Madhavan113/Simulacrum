import { useMemo, useState } from 'react'
import { EngineControl } from '../components/EngineControl'
import { PipelineTheater } from '../components/PipelineTheater'
import { PublicationCard } from '../components/PublicationCard'
import { PublicationDetail } from '../components/PublicationDetail'
import { ResearchAgentCard } from '../components/ResearchAgentCard'
import { Button, EmptyState } from '../components/ui'
import {
  useResearchStatus,
  usePublications,
  usePublication,
  useResearchAgents,
  useResearchStart,
  useResearchStop,
  useResearchRunNow,
} from '../hooks/useResearch'

function InlineStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className="font-mono text-sm font-semibold"
        style={{ color: 'var(--text-primary)', minWidth: 16 }}
      >
        {value}
      </span>
      <span className="label" style={{ fontSize: 9, color: 'var(--text-dim)' }}>
        {label}
      </span>
    </div>
  )
}

export function Publications() {
  const { data: status, error: statusError } = useResearchStatus()
  const { data: publications, isLoading: pubsLoading } = usePublications()
  const { data: agents } = useResearchAgents()
  const startMutation = useResearchStart()
  const stopMutation = useResearchStop()
  const runNowMutation = useResearchRunNow()

  const [selectedPubId, setSelectedPubId] = useState<string | null>(null)
  const { data: selectedPubData } = usePublication(selectedPubId ?? undefined)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [authorFilter, setAuthorFilter] = useState<string>('')

  const agentNameById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const a of agents ?? []) map[a.id] = a.name
    return map
  }, [agents])

  const uniqueAuthors = useMemo(() => {
    if (!publications) return []
    const seen = new Set<string>()
    const out: { id: string; name: string }[] = []
    for (const p of publications) {
      if (p.agentId && !seen.has(p.agentId)) {
        seen.add(p.agentId)
        out.push({ id: p.agentId, name: agentNameById[p.agentId] ?? p.agentId })
      }
    }
    return out
  }, [publications, agentNameById])

  const filteredPubs = useMemo(() => {
    if (!publications) return []
    return publications.filter(p => {
      if (statusFilter && p.status !== statusFilter) return false
      if (authorFilter && p.agentId !== authorFilter) return false
      return true
    })
  }, [publications, statusFilter, authorFilter])

  if (statusError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12">
        <p className="text-sm" style={{ color: 'var(--danger)' }}>
          Failed to connect to the research engine.
        </p>
        <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
          {statusError instanceof Error ? statusError.message : 'Check that the API server is running.'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0 p-6" style={{ maxWidth: 1200 }}>

      {/* Header */}
      <div className="flex items-end justify-between gap-6 mb-2">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
            Research Lab
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)', maxWidth: 480 }}>
            Autonomous agents observe market behavior, identify patterns, and produce
            rigorous publications with self-evaluation suites.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {status?.running && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => runNowMutation.mutate()}
              disabled={runNowMutation.isPending}
            >
              Run Now
            </Button>
          )}
          <EngineControl
            label={status?.running ? `Tick ${status.tickCount}` : 'Stopped'}
            running={status?.running ?? false}
            onStart={() => startMutation.mutate()}
            onStop={() => stopMutation.mutate()}
            isLoading={startMutation.isPending || stopMutation.isPending}
          />
        </div>
      </div>

      {/* Inline stats */}
      <div className="flex items-center gap-6 mt-3 mb-6">
        <InlineStat label="PUBLISHED" value={status?.publishedCount ?? 0} />
        <span style={{ color: 'var(--border)' }}>|</span>
        <InlineStat label="TOTAL" value={status?.totalPublications ?? 0} />
        <span style={{ color: 'var(--border)' }}>|</span>
        <InlineStat label="AVG SCORE" value={status?.averageEvalScore ?? '—'} />
        <span style={{ color: 'var(--border)' }}>|</span>
        <InlineStat label="OBSERVATIONS" value={status?.totalObservations ?? 0} />
      </div>

      {status?.lastError && (
        <div
          className="px-4 py-2 text-xs mb-4"
          style={{ background: 'rgba(196,90,90,0.08)', border: '1px solid rgba(196,90,90,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--danger)' }}
        >
          {status.lastError}
        </div>
      )}

      {/* Pipeline */}
      <div className="mb-8">
        <h2 className="label text-xs mb-3" style={{ color: 'var(--text-dim)' }}>PIPELINE</h2>
        <PipelineTheater agents={agents ?? []} />
      </div>

      {/* Agent Profiles */}
      <div className="mb-8">
        <h2 className="label text-xs mb-3" style={{ color: 'var(--text-dim)' }}>RESEARCHERS</h2>
        {agents && agents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {agents.map((agent) => (
              <ResearchAgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        ) : (
          <EmptyState
            message={status?.running ? 'Initializing research agents...' : 'Start the engine to deploy researchers.'}
          />
        )}
      </div>

      <div style={{ height: 1, background: 'var(--border)', margin: '8px 0 24px' }} />

      {/* Publications */}
      <div>
        <div className="flex items-center justify-between mb-4 gap-4">
          <h2 className="label text-xs shrink-0" style={{ color: 'var(--text-dim)' }}>PUBLICATIONS</h2>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Author filter */}
            {uniqueAuthors.length > 1 && (
              <>
                <select
                  value={authorFilter}
                  onChange={e => setAuthorFilter(e.target.value)}
                  className="label"
                  style={{
                    fontSize: 11,
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    background: authorFilter ? 'var(--accent-dim)' : 'var(--bg-surface)',
                    color: authorFilter ? 'var(--accent)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    outline: 'none',
                    appearance: 'none',
                    paddingRight: 20,
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 8 5' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L4 4L7 1' stroke='%236B6460' stroke-linecap='round'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 6px center',
                  }}
                >
                  <option value="">All authors</option>
                  {uniqueAuthors.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <div style={{ width: 1, height: 14, background: 'var(--border)' }} />
              </>
            )}

            {/* Status filter */}
            {['', 'PUBLISHED', 'RETRACTED', 'EVALUATING', 'DRAFTING'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="label transition-colors duration-150"
                style={{
                  fontSize: 11,
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid',
                  cursor: 'pointer',
                  background: statusFilter === s ? 'var(--accent-dim)' : 'transparent',
                  borderColor: statusFilter === s ? 'var(--accent)' : 'var(--border)',
                  color: statusFilter === s ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                {s || 'All'}
              </button>
            ))}
          </div>
        </div>

        {pubsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="skeleton-pulse"
                style={{
                  height: 140,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                }}
              />
            ))}
          </div>
        ) : filteredPubs.length === 0 ? (
          <EmptyState
            message={
              statusFilter || authorFilter
                ? 'No publications match filters'
                : status?.running
                  ? 'Researchers are collecting data. First publications will appear shortly.'
                  : 'Start the research engine to begin producing publications.'
            }
          />
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

      {selectedPubData?.publication && (
        <PublicationDetail
          publication={selectedPubData.publication}
          onClose={() => setSelectedPubId(null)}
        />
      )}
    </div>
  )
}
