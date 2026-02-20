import type { ResearchObservation, ObservationCategory } from '@simulacrum/types'

const CATEGORY_META: Record<ObservationCategory, { label: string; hue: number }> = {
  market_creation:    { label: 'Market Created',  hue: 210 },
  price_movement:     { label: 'Price Movement',  hue: 145 },
  agent_strategy:     { label: 'Strategy',         hue: 270 },
  dispute_resolution: { label: 'Dispute',          hue: 0 },
  reputation_change:  { label: 'Reputation',       hue: 40 },
  coordination_signal:{ label: 'Coordination',     hue: 170 },
  liquidity_event:    { label: 'Liquidity',        hue: 215 },
  anomaly:            { label: 'Anomaly',          hue: 25 },
}

function dotColor(category: ObservationCategory): string {
  const meta = CATEGORY_META[category]
  return meta ? `hsl(${meta.hue}, 55%, 55%)` : 'var(--text-dim)'
}

export function ObservationFeed({ observations }: { observations: ResearchObservation[] }) {
  if (observations.length === 0) {
    return (
      <p className="text-xs" style={{ color: 'var(--text-dim)', padding: 16 }}>
        No observations collected yet.
      </p>
    )
  }

  return (
    <div className="flex flex-col" style={{ maxHeight: 400, overflowY: 'auto' }}>
      {observations.slice(-50).reverse().map((obs) => {
        const meta = CATEGORY_META[obs.category]
        return (
          <div
            key={obs.id}
            className="flex items-center gap-3 px-3 py-2"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: dotColor(obs.category),
                flexShrink: 0,
              }}
            />
            <span className="label flex-1 truncate" style={{ fontSize: 10 }}>
              {meta?.label ?? obs.category}
              {obs.marketId && ` · ${obs.marketId.slice(0, 8)}…`}
            </span>
            <span className="label shrink-0" style={{ fontSize: 9, color: 'var(--text-dim)' }}>
              {new Date(obs.timestamp).toLocaleTimeString()}
            </span>
          </div>
        )
      })}
    </div>
  )
}
