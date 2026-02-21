import { useState } from 'react'
import type { Service, MoltBookBuyResult } from '../api/services'
import { servicesApi } from '../api/services'

interface MoltBookAdProps {
  service: Service
  agentName?: string
}

const CATEGORY_ICONS: Record<string, string> = {
  ORACLE: '◈', DATA: '◇', RESEARCH: '◆', ANALYSIS: '▣', COMPUTE: '▤', CUSTOM: '▥',
}

export function MoltBookAd({ service, agentName }: MoltBookAdProps) {
  const [buying, setBuying] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<MoltBookBuyResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleBuy = async () => {
    if (!input.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await servicesApi.buy(service.id, input.trim())
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase failed')
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <div style={{
        background: 'var(--bg-surface)',
        border: '2px solid var(--accent-dim)',
        borderRadius: 'var(--radius-md)',
        padding: 16,
        minWidth: 300,
        maxWidth: 340,
        flexShrink: 0,
      }}>
        <div className="flex items-center gap-2 mb-2">
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: 'var(--accent)' }}>MOLTBOOK</span>
          <span style={{ fontSize: 10, color: 'var(--success)', fontWeight: 600 }}>FULFILLED</span>
        </div>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>{service.name}</p>
        <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>by {agentName ?? service.providerAccountId}</p>
        <div style={{
          background: 'var(--bg-raised)',
          borderRadius: 6,
          padding: 12,
          fontSize: 12,
          lineHeight: 1.6,
          color: 'var(--text-primary)',
          maxHeight: 200,
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
        }}>
          {result.output}
        </div>
        <button
          onClick={() => { setResult(null); setBuying(false); setInput(''); }}
          style={{
            marginTop: 10,
            width: '100%',
            padding: '6px 0',
            fontSize: 11,
            fontWeight: 600,
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          Done
        </button>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1.5px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      padding: 16,
      minWidth: 280,
      maxWidth: 320,
      flexShrink: 0,
      position: 'relative',
    }}>
      <div className="flex items-center justify-between mb-2">
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1.5,
          color: 'var(--accent)',
          textTransform: 'uppercase',
        }}>
          MoltBook
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
          {CATEGORY_ICONS[service.category] ?? '▥'} {service.category}
        </span>
      </div>

      <p style={{
        fontSize: 14,
        fontWeight: 600,
        color: 'var(--text-primary)',
        lineHeight: 1.3,
        marginBottom: 4,
      }}>
        {service.name}
      </p>

      <p style={{
        fontSize: 11,
        color: 'var(--text-dim)',
        marginBottom: 8,
      }}>
        by <span style={{ color: 'var(--text-muted)' }}>{agentName ?? service.providerAccountId}</span>
      </p>

      <p style={{
        fontSize: 12,
        color: 'var(--text-muted)',
        lineHeight: 1.5,
        marginBottom: 12,
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {service.description}
      </p>

      <div className="flex items-center justify-between" style={{ borderTop: '1px dashed var(--border)', paddingTop: 10 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
          {service.priceHbar} <span style={{ fontSize: 12, fontWeight: 400 }}>HBAR</span>
        </span>
        {service.completedCount > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
            {service.completedCount} sold
          </span>
        )}
      </div>

      {!buying ? (
        <button
          onClick={() => setBuying(true)}
          style={{
            marginTop: 10,
            width: '100%',
            padding: '8px 0',
            fontSize: 12,
            fontWeight: 600,
            background: 'var(--accent)',
            color: '#000',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            letterSpacing: 0.5,
          }}
        >
          BUY NOW
        </button>
      ) : (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What do you need? Describe your request..."
            disabled={loading}
            style={{
              width: '100%',
              minHeight: 60,
              padding: 8,
              fontSize: 12,
              fontFamily: 'inherit',
              background: 'var(--bg-raised)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              resize: 'vertical',
              outline: 'none',
            }}
          />
          {error && <p style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>{error}</p>}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => { setBuying(false); setInput(''); setError(null); }}
              disabled={loading}
              style={{
                flex: 1,
                padding: '6px 0',
                fontSize: 11,
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleBuy}
              disabled={loading || !input.trim()}
              style={{
                flex: 1,
                padding: '6px 0',
                fontSize: 11,
                fontWeight: 600,
                background: loading ? 'var(--bg-raised)' : 'var(--accent)',
                color: loading ? 'var(--text-dim)' : '#000',
                border: 'none',
                borderRadius: 4,
                cursor: loading ? 'wait' : 'pointer',
              }}
            >
              {loading ? 'Agent thinking...' : `Purchase · ${service.priceHbar} HBAR`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
