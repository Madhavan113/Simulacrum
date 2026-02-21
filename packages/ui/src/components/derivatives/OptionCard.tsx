import { useState } from 'react'
import type { OptionContract } from '../../api/derivatives'
import { Card } from '../ui/Card'
import { StatusBadge } from '../ui/Badge'

interface OptionCardProps {
  option: OptionContract
  marketQuestion?: string
  agentNames?: Record<string, string>
}

function formatPnl(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)} HBAR`
}

function pnlColor(value: number): string {
  if (value > 0) return 'var(--success)'
  if (value < 0) return 'var(--danger)'
  return 'var(--text-muted)'
}

function formatTimeRemaining(days: number | undefined): string {
  if (days === undefined) return '—'
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 24 * 60))}m`
  if (days < 1) return `${Math.round(days * 24)}h`
  return `${days.toFixed(1)}d`
}

export function OptionCard({ option, marketQuestion, agentNames }: OptionCardProps) {
  const [expanded, setExpanded] = useState(false)
  const isCall = option.optionType === 'CALL'
  const writerName = agentNames?.[option.writerAccountId]
  const holderName = option.holderAccountId ? agentNames?.[option.holderAccountId] : undefined
  const hasMtM = option.currentPremiumHbar !== undefined
  const isSold = Boolean(option.holderAccountId)

  return (
    <Card>
      <div
        style={{ cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <StatusBadge status={option.optionType} />
            <StatusBadge status={option.status} />
          </div>
          {hasMtM && (
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
              {formatTimeRemaining(option.timeToExpiryDays)} left
            </span>
          )}
        </div>

        <div className="mb-3">
          <span
            style={{
              fontSize: 13,
              color: 'var(--text-primary)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.4,
            }}
            title={marketQuestion}
          >
            {marketQuestion ?? option.marketId}
          </span>
          <span style={{ fontSize: 11, display: 'block', color: 'var(--text-dim)', marginTop: 2 }}>
            {option.outcome} · {isCall ? 'Pays if probability exceeds strike' : 'Pays if probability stays below strike'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="label" style={{ display: 'block', fontSize: 10, marginBottom: 2 }}>Strike</span>
            <span style={{ fontSize: 14, fontWeight: 500, color: isCall ? 'var(--success)' : 'var(--danger)' }}>
              {(option.strikePrice * 100).toFixed(1)}%
            </span>
          </div>
          <div>
            <span className="label" style={{ display: 'block', fontSize: 10, marginBottom: 2 }}>
              {hasMtM ? 'Premium (paid)' : 'Premium'}
            </span>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
              {option.premiumHbar.toFixed(2)} HBAR
            </span>
          </div>
          {hasMtM && (
            <div>
              <span className="label" style={{ display: 'block', fontSize: 10, marginBottom: 2 }}>Mark Value</span>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent)' }}>
                {option.currentPremiumHbar!.toFixed(2)} HBAR
              </span>
            </div>
          )}
          {hasMtM && option.currentMarkPrice !== undefined && (
            <div>
              <span className="label" style={{ display: 'block', fontSize: 10, marginBottom: 2 }}>Underlying</span>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                {(option.currentMarkPrice * 100).toFixed(1)}%
              </span>
            </div>
          )}
          <div>
            <span className="label" style={{ display: 'block', fontSize: 10, marginBottom: 2 }}>Size</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {option.sizeHbar.toFixed(1)} HBAR
            </span>
          </div>
          <div>
            <span className="label" style={{ display: 'block', fontSize: 10, marginBottom: 2 }}>Expires</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {new Date(option.expiresAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        {hasMtM && isSold && (
          <div
            style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 8 }}
            className="grid grid-cols-2 gap-3"
          >
            <div>
              <span className="label" style={{ display: 'block', fontSize: 10, marginBottom: 2 }}>Holder PnL</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: pnlColor(option.holderPnlHbar ?? 0) }}>
                {formatPnl(option.holderPnlHbar ?? 0)}
              </span>
            </div>
            <div>
              <span className="label" style={{ display: 'block', fontSize: 10, marginBottom: 2 }}>Writer PnL</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: pnlColor(option.writerPnlHbar ?? 0) }}>
                {formatPnl(option.writerPnlHbar ?? 0)}
              </span>
            </div>
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 8 }} className="flex justify-between">
          <div>
            <span className="label" style={{ fontSize: 9 }}>Writer</span>
            <span style={{ display: 'block', fontSize: 12, color: writerName ? 'var(--text-muted)' : 'var(--text-dim)', fontFamily: writerName ? 'inherit' : 'monospace' }}>
              {writerName ?? option.writerAccountId}
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="label" style={{ fontSize: 9 }}>Holder</span>
            <span style={{ display: 'block', fontSize: 12, color: holderName ? 'var(--text-muted)' : 'var(--text-dim)', fontFamily: holderName ? 'inherit' : 'monospace' }}>
              {holderName ?? (option.holderAccountId || '—')}
            </span>
          </div>
        </div>
      </div>

      {expanded && (
        <div
          style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10, fontSize: 12 }}
          className="grid grid-cols-2 gap-x-6 gap-y-2"
        >
          <Detail label="Collateral">{option.collateralHbar.toFixed(2)} HBAR</Detail>
          <Detail label="Created">{new Date(option.createdAt).toLocaleString()}</Detail>
          {option.exercisedAt && <Detail label="Exercised">{new Date(option.exercisedAt).toLocaleString()}</Detail>}
          {option.settlementHbar !== undefined && <Detail label="Settlement">{option.settlementHbar.toFixed(2)} HBAR</Detail>}
          {option.lastRefreshedAt && <Detail label="Last MtM">{new Date(option.lastRefreshedAt).toLocaleString()}</Detail>}
          <div className="col-span-2">
            <span className="label" style={{ fontSize: 10 }}>Writer Account</span>
            <span style={{ display: 'block', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-dim)' }}>
              {option.writerAccountId}
            </span>
          </div>
          {option.holderAccountId && (
            <div className="col-span-2">
              <span className="label" style={{ fontSize: 10 }}>Holder Account</span>
              <span style={{ display: 'block', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-dim)' }}>
                {option.holderAccountId}
              </span>
            </div>
          )}
          <div className="col-span-2" style={{ marginTop: 2 }}>
            <span className="label" style={{ fontSize: 10 }}>Option ID</span>
            <span style={{ display: 'block', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-dim)', wordBreak: 'break-all' }}>
              {option.id}
            </span>
          </div>
        </div>
      )}
    </Card>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="label" style={{ fontSize: 10, display: 'block', marginBottom: 1 }}>{label}</span>
      <span style={{ color: 'var(--text-muted)' }}>{children}</span>
    </div>
  )
}
