import type { ResearchPublication } from '@simulacrum/types'
import { RESEARCH_FOCUS_SHORT_LABELS } from '@simulacrum/types'

const STATUS_COLORS: Record<string, string> = {
  PUBLISHED: 'var(--accent)',
  RETRACTED: '#e74c3c',
  EVALUATING: '#f39c12',
  DRAFTING: '#3498db',
  REVIEWING: '#9b59b6',
  ANALYZING: '#2ecc71',
  HYPOTHESIZING: '#1abc9c',
  COLLECTING: 'var(--text-dim)',
}

export function PublicationCard({
  publication,
  onClick,
}: {
  publication: ResearchPublication
  onClick?: () => void
}) {
  const evalScore = publication.evaluation?.overallScore
  const timeLabel = publication.publishedAt
    ? new Date(publication.publishedAt).toLocaleDateString()
    : new Date(publication.createdAt).toLocaleDateString()

  return (
    <button
      onClick={onClick}
      aria-label={`Publication: ${publication.title}`}
      className="flex flex-col gap-3 p-4 text-left transition-colors"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        cursor: 'pointer',
        width: '100%',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-primary leading-snug flex-1">
          {publication.title || 'Untitled Draft'}
        </p>
        <span
          className="label shrink-0 px-2 py-0.5"
          style={{
            fontSize: 10,
            borderRadius: 4,
            background: STATUS_COLORS[publication.status] ?? 'var(--text-dim)',
            color: '#fff',
          }}
        >
          {publication.status}
        </span>
      </div>

      {publication.abstract && (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {publication.abstract.length > 180
            ? `${publication.abstract.slice(0, 180)}…`
            : publication.abstract}
        </p>
      )}

      <div className="flex items-center justify-between">
        <span
          className="label px-2 py-0.5"
          style={{
            fontSize: 10,
            borderRadius: 4,
            background: 'var(--bg-raised)',
            border: '1px solid var(--border)',
          }}
        >
          {RESEARCH_FOCUS_SHORT_LABELS[publication.focusArea] ?? publication.focusArea}
        </span>

        <div className="flex items-center gap-3">
          {evalScore !== undefined && (
            <span
              className="font-mono text-xs font-semibold"
              style={{ color: evalScore >= 60 ? 'var(--accent)' : '#e74c3c' }}
            >
              {evalScore}/100
            </span>
          )}
          <span className="label" style={{ fontSize: 10 }}>{timeLabel}</span>
        </div>
      </div>

      {publication.findings.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="label" style={{ fontSize: 10 }}>
            {publication.findings.length} finding{publication.findings.length !== 1 ? 's' : ''}
          </span>
          <span style={{ color: 'var(--border)' }}>·</span>
          <span className="label" style={{ fontSize: 10 }}>
            {publication.dataWindow.observationCount} observations
          </span>
        </div>
      )}
    </button>
  )
}
