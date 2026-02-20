import type { ResearchAgentProfile } from '@simulacrum/types'
import { RESEARCH_FOCUS_SHORT_LABELS } from '@simulacrum/types'

export function ResearchAgentCard({ agent }: { agent: ResearchAgentProfile }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: agent.currentStage ? 'var(--accent)' : 'var(--text-dim)',
          flexShrink: 0,
        }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-primary truncate">{agent.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="label" style={{ fontSize: 10 }}>
            {RESEARCH_FOCUS_SHORT_LABELS[agent.focusArea] ?? agent.focusArea}
          </span>
          {agent.currentStage && (
            <>
              <span style={{ color: 'var(--border)' }}>·</span>
              <span className="label" style={{ fontSize: 10, color: 'var(--accent)' }}>
                {agent.currentStage}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className="font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
          {agent.publicationCount} pub{agent.publicationCount !== 1 ? 's' : ''}
        </span>
        {agent.averageEvalScore > 0 && (
          <span className="font-mono text-xs" style={{ color: 'var(--accent)' }}>
            avg {Math.round(agent.averageEvalScore)}
          </span>
        )}
      </div>
    </div>
  )
}
