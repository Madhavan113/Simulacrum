import type { Service } from '../../api/services'
import { Card } from '../ui/Card'
import { Badge, StatusBadge } from '../ui/Badge'

interface ServiceCardProps {
  service: Service
  providerName?: string
  onClick?: () => void
}

export function ServiceCard({ service, providerName, onClick }: ServiceCardProps) {
  return (
    <Card hoverable onClick={onClick}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Badge variant="default">{service.category}</Badge>
          {providerName && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>by {providerName}</span>
          )}
        </div>
        <StatusBadge status={service.status} />
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
        {service.name}
      </h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 12, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {service.description}
      </p>

      <div className="flex items-center justify-between" style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent)' }}>
            {service.priceHbar} HBAR
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {service.completedCount} completed
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span style={{ fontSize: 12, color: 'var(--warning)' }}>
            {'★'.repeat(Math.round(service.rating))}{'☆'.repeat(5 - Math.round(service.rating))}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            ({service.reviewCount})
          </span>
        </div>
      </div>

      {service.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {service.tags.slice(0, 4).map(tag => (
            <span
              key={tag}
              style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-raised)',
                color: 'var(--text-dim)',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </Card>
  )
}
