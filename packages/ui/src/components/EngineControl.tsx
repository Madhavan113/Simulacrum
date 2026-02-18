export function EngineControl({
  label,
  running,
  onStart,
  onStop,
  isLoading,
}: {
  label: string
  running: boolean
  onStart: () => void
  onStop: () => void
  isLoading: boolean
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <span
        style={{
          width: 8, height: 8, borderRadius: '50%',
          background: running ? 'var(--accent)' : 'var(--text-dim)',
          flexShrink: 0,
        }}
      />
      <span className="label text-xs flex-1">{label}</span>
      <button
        onClick={running ? onStop : onStart}
        disabled={isLoading}
        className="label text-xs px-3 py-1"
        style={{
          background: running ? 'var(--bg-raised)' : 'var(--accent-dim)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          cursor: isLoading ? 'wait' : 'pointer',
          opacity: isLoading ? 0.5 : 1,
        }}
      >
        {running ? 'Stop' : 'Start'}
      </button>
    </div>
  )
}
