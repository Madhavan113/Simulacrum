import type { PublicationEvaluation } from '@simulacrum/types'

const DIMENSIONS = [
  { key: 'reproducibility', label: 'Repro' },
  { key: 'evidenceBacking', label: 'Evidence' },
  { key: 'novelty', label: 'Novelty' },
  { key: 'coherence', label: 'Coherence' },
  { key: 'statisticalSignificance', label: 'Stats' },
  { key: 'predictiveValidity', label: 'Predict' },
] as const

type DimKey = (typeof DIMENSIONS)[number]['key']

const SIZE = 200
const CENTER = SIZE / 2
const RADIUS = 75
const ANGLE_STEP = (2 * Math.PI) / DIMENSIONS.length

function polarToCart(angle: number, radius: number): [number, number] {
  return [
    CENTER + radius * Math.cos(angle - Math.PI / 2),
    CENTER + radius * Math.sin(angle - Math.PI / 2),
  ]
}

export function EvalRadar({ evaluation }: { evaluation: PublicationEvaluation }) {
  const gridLevels = [0.25, 0.5, 0.75, 1.0]

  const dataPoints = DIMENSIONS.map((dim, i) => {
    const score = evaluation.dimensions[dim.key as DimKey]?.score ?? 0
    const normalizedRadius = (score / 100) * RADIUS
    const angle = i * ANGLE_STEP
    return polarToCart(angle, normalizedRadius)
  })

  const dataPath = dataPoints.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ') + ' Z'

  return (
    <div style={{ width: SIZE, height: SIZE, margin: '0 auto' }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
        {/* Grid rings */}
        {gridLevels.map((level) => {
          const points = DIMENSIONS.map((_, i) => {
            const [x, y] = polarToCart(i * ANGLE_STEP, RADIUS * level)
            return `${x},${y}`
          }).join(' ')
          return (
            <polygon
              key={level}
              points={points}
              fill="none"
              stroke="var(--border)"
              strokeWidth={0.5}
            />
          )
        })}

        {/* Axis lines */}
        {DIMENSIONS.map((_, i) => {
          const [x, y] = polarToCart(i * ANGLE_STEP, RADIUS)
          return (
            <line
              key={i}
              x1={CENTER}
              y1={CENTER}
              x2={x}
              y2={y}
              stroke="var(--border)"
              strokeWidth={0.5}
            />
          )
        })}

        {/* Data polygon */}
        <path d={dataPath} fill="var(--accent-dim)" stroke="var(--accent)" strokeWidth={1.5} />

        {/* Data points */}
        {dataPoints.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={3} fill="var(--accent)" />
        ))}

        {/* Labels */}
        {DIMENSIONS.map((dim, i) => {
          const [x, y] = polarToCart(i * ANGLE_STEP, RADIUS + 18)
          const score = evaluation.dimensions[dim.key as DimKey]?.score ?? 0
          return (
            <text
              key={dim.key}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--text-muted)"
              fontSize={9}
              fontFamily="inherit"
            >
              {dim.label} {score}
            </text>
          )
        })}

        {/* Center score */}
        <text
          x={CENTER}
          y={CENTER}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--text-primary)"
          fontSize={18}
          fontWeight={600}
          fontFamily="inherit"
        >
          {evaluation.overallScore}
        </text>
      </svg>
    </div>
  )
}
