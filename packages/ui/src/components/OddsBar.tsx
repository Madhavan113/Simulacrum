interface OddsBarProps {
  outcomes: string[]
  /** outcome -> bet count or volume; used to compute fill % */
  counts: Record<string, number>
  height?: number
}

export function OddsBar({ outcomes, counts, height = 8 }: OddsBarProps) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1
  const primary = outcomes[0] ?? 'YES'
  const fillPct = ((counts[primary] ?? 0) / total) * 100

  return (
    <div
      className="relative w-full overflow-hidden rounded-sm"
      style={{ height, background: 'var(--bg-raised)' }}
    >
      <div
        className="absolute left-0 top-0 h-full transition-[width] duration-500"
        style={{ width: `${fillPct}%`, background: 'var(--accent-dim)' }}
      />
    </div>
  )
}
