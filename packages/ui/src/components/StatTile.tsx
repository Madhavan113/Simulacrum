export function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="flex flex-col gap-1 p-4"
      style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--bg-surface)' }}
    >
      <span className="label">{label}</span>
      <span className="text-2xl font-light text-primary" style={{ letterSpacing: -1 }}>{value}</span>
    </div>
  )
}
