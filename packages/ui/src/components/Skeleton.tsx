interface SkeletonProps {
  width?: string | number
  height?: string | number
  borderRadius?: number
  className?: string
}

export function Skeleton({ width = '100%', height = 16, borderRadius = 6, className = '' }: SkeletonProps) {
  return (
    <div
      className={`skeleton-pulse ${className}`}
      style={{
        width,
        height,
        borderRadius,
        background: 'var(--bg-raised)',
      }}
    />
  )
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex flex-col gap-3 p-4 ${className}`}
      style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--bg-surface)' }}
    >
      <Skeleton height={14} width="80%" />
      <Skeleton height={10} width="50%" />
      <Skeleton height={8} />
      <div className="flex justify-between">
        <Skeleton height={10} width="40%" />
        <Skeleton height={10} width="20%" />
      </div>
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div
      className="flex items-center gap-4 px-4 py-3"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <Skeleton height={12} width="50%" />
      <Skeleton height={12} width={60} />
      <Skeleton height={6} width={96} />
      <Skeleton height={12} width={80} />
      <Skeleton height={10} width={60} />
    </div>
  )
}
