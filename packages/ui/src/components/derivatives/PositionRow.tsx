import type { PerpetualPosition } from '../../api/derivatives'
import { StatusBadge } from '../ui/Badge'
import { PnLCell } from './PnLCell'

interface PositionRowProps {
  position: PerpetualPosition
  marketQuestion?: string
  agentName?: string
}

export function PositionRow({ position, marketQuestion, agentName }: PositionRowProps) {
  return (
    <div
      className="grid px-4 py-2 transition-colors duration-150"
      style={{
        gridTemplateColumns: '1fr 80px 80px 90px 90px 90px 60px 90px',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-raised)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      <div className="flex flex-col">
        <span
          style={{
            fontSize: 13,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 260,
          }}
          title={marketQuestion}
        >
          {marketQuestion ?? position.marketId}
        </span>
        <div className="flex items-center gap-2" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          <span>{position.outcome}</span>
          {agentName && (
            <>
              <span style={{ color: 'var(--border)' }}>·</span>
              <span>{agentName}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center">
        <StatusBadge status={position.side} />
      </div>
      <span style={{ fontSize: 13, color: 'var(--text-primary)', alignSelf: 'center' }}>
        {position.sizeHbar.toFixed(1)}
      </span>
      <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-muted)', alignSelf: 'center' }}>
        {(position.entryPrice * 100).toFixed(1)}%
      </span>
      <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-muted)', alignSelf: 'center' }}>
        {(position.markPrice * 100).toFixed(1)}%
      </span>
      <div style={{ alignSelf: 'center' }}>
        <PnLCell value={position.unrealizedPnlHbar} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
        {position.leverage}x
      </span>
      <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-dim)', alignSelf: 'center' }}>
        {(position.liquidationPrice * 100).toFixed(1)}%
      </span>
    </div>
  )
}
