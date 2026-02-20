import { useEffect } from 'react'
import type { ResearchPublication } from '@simulacrum/types'
import { RESEARCH_FOCUS_LABELS } from '@simulacrum/types'
import { HashScanLink } from './HashScanLink'
import { EvalRadar } from './EvalRadar'

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="label"
      style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}
    >
      {children}
    </h3>
  )
}

export function PublicationDetail({
  publication,
  onClose,
}: {
  publication: ResearchPublication
  onClose: () => void
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const verdictColor =
    publication.evaluation?.verdict === 'PASS' ? 'var(--accent)'
    : publication.evaluation?.verdict === 'FAIL' ? '#e74c3c'
    : '#f39c12'

  return (
    <div
      className="fixed inset-0 flex justify-end"
      style={{ zIndex: 50, background: 'rgba(0,0,0,0.5)', animation: 'fadeIn 150ms ease-out' }}
      onClick={onClose}
    >
      <div
        className="h-full overflow-y-auto"
        style={{
          width: 560,
          maxWidth: '100vw',
          background: 'var(--bg-base)',
          borderLeft: '1px solid var(--border)',
          animation: 'slideInRight 200ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 flex flex-col gap-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <span
                className="label px-2 py-0.5"
                style={{ fontSize: 10, borderRadius: 4, background: 'var(--bg-raised)', border: '1px solid var(--border)' }}
              >
                {RESEARCH_FOCUS_LABELS[publication.focusArea] ?? publication.focusArea}
              </span>
              <h2 className="text-lg font-semibold text-primary mt-2 leading-snug">
                {publication.title}
              </h2>
              <div className="flex items-center gap-2 mt-2">
                {publication.evaluation && (
                  <span
                    className="font-mono text-xs font-semibold px-2 py-0.5"
                    style={{ borderRadius: 4, background: verdictColor, color: '#fff' }}
                  >
                    {publication.evaluation.verdict} · {publication.evaluation.overallScore}/100
                  </span>
                )}
                {publication.publishedAt && (
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    {new Date(publication.publishedAt).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="label text-xs px-2 py-1"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}
            >
              Close
            </button>
          </div>

          {/* Abstract */}
          <div>
            <SectionHeading>ABSTRACT</SectionHeading>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {publication.abstract}
            </p>
          </div>

          {/* Methodology */}
          <div>
            <SectionHeading>METHODOLOGY</SectionHeading>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {publication.methodology}
            </p>
          </div>

          {/* Findings */}
          <div>
            <SectionHeading>FINDINGS</SectionHeading>
            <div className="flex flex-col gap-4">
              {publication.findings.map((finding, i) => (
                <div
                  key={i}
                  className="p-3"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10 }}
                >
                  <p className="text-sm font-medium text-primary">{finding.claim}</p>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    {finding.evidence}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="font-mono text-xs" style={{ color: 'var(--accent)' }}>
                      Confidence: {(finding.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  {finding.onChainRefs.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {finding.onChainRefs.map((ref, j) => (
                        <HashScanLink key={j} id={ref.entityId} url={ref.hashScanUrl} label={ref.description} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Conclusion */}
          <div>
            <SectionHeading>CONCLUSION</SectionHeading>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {publication.conclusion}
            </p>
          </div>

          {/* Limitations */}
          <div>
            <SectionHeading>LIMITATIONS</SectionHeading>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {publication.limitations}
            </p>
          </div>

          {/* Future Work */}
          {publication.futureWork && (
            <div>
              <SectionHeading>FUTURE WORK</SectionHeading>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {publication.futureWork}
              </p>
            </div>
          )}

          {/* Evaluation */}
          {publication.evaluation && (
            <div>
              <SectionHeading>EVALUATION</SectionHeading>
              <EvalRadar evaluation={publication.evaluation} />
              <div className="mt-4 flex flex-col gap-2">
                {publication.evaluation.strengths.length > 0 && (
                  <div>
                    <p className="label text-xs" style={{ color: 'var(--accent)' }}>Strengths</p>
                    <ul className="mt-1">
                      {publication.evaluation.strengths.map((s, i) => (
                        <li key={i} className="text-xs" style={{ color: 'var(--text-muted)' }}>• {s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {publication.evaluation.critiques.length > 0 && (
                  <div>
                    <p className="label text-xs" style={{ color: '#e74c3c' }}>Critiques</p>
                    <ul className="mt-1">
                      {publication.evaluation.critiques.map((c, i) => (
                        <li key={i} className="text-xs" style={{ color: 'var(--text-muted)' }}>• {c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Data window metadata */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <SectionHeading>DATA WINDOW</SectionHeading>
            <div className="flex flex-wrap gap-4 text-xs" style={{ color: 'var(--text-dim)' }}>
              <span>{publication.dataWindow.observationCount} observations</span>
              <span>{publication.dataWindow.marketIds.length} markets</span>
              <span>
                {new Date(publication.dataWindow.startTime).toLocaleDateString()} –{' '}
                {new Date(publication.dataWindow.endTime).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
