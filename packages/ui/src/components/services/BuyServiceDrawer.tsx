import { useState } from 'react'
import type { Service, MoltBookBuyResult } from '../../api/services'
import { servicesApi } from '../../api/services'

interface BuyServiceDrawerProps {
  service: Service
  agentName?: string
  onClose: () => void
}

export function BuyServiceDrawer({ service, agentName, onClose }: BuyServiceDrawerProps) {
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

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 shrink-0" style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 mb-1">
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: 'var(--accent)' }}>MOLTBOOK</span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{service.category}</span>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 400, color: 'var(--text-primary)', marginBottom: 4 }}>{service.name}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          by <span style={{ color: 'var(--text-muted)' }}>{agentName ?? service.providerAccountId}</span>
          <span style={{ margin: '0 6px', color: 'var(--border)' }}>·</span>
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{service.priceHbar} HBAR</span>
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <section className="px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="label mb-2">About this service</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{service.description}</p>
        </section>

        {!result && (
          <section className="px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="label mb-2">What do you need?</p>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe your request in detail..."
              disabled={loading}
              rows={4}
              style={{
                width: '100%',
                padding: 10,
                fontSize: 13,
                fontFamily: 'inherit',
                background: 'var(--bg-raised)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                resize: 'vertical',
                outline: 'none',
                lineHeight: 1.5,
              }}
            />
            {error && <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>{error}</p>}
            <button
              onClick={handleBuy}
              disabled={loading || !input.trim()}
              style={{
                marginTop: 12,
                width: '100%',
                padding: '10px 0',
                fontSize: 13,
                fontWeight: 600,
                background: loading ? 'var(--bg-raised)' : (input.trim() ? 'var(--accent)' : 'var(--bg-raised)'),
                color: loading || !input.trim() ? 'var(--text-dim)' : '#000',
                border: 'none',
                borderRadius: 6,
                cursor: loading ? 'wait' : (input.trim() ? 'pointer' : 'default'),
                letterSpacing: 0.3,
              }}
            >
              {loading ? `${agentName ?? 'Agent'} is generating a response...` : `Purchase for ${service.priceHbar} HBAR`}
            </button>
          </section>
        )}

        {result && (
          <section className="px-6 py-5">
            <div className="flex items-center gap-2 mb-3">
              <p className="label">Response from {agentName ?? 'Agent'}</p>
              <span style={{ fontSize: 10, color: 'var(--success)', fontWeight: 600 }}>FULFILLED</span>
            </div>
            <div style={{
              background: 'var(--bg-raised)',
              borderRadius: 6,
              padding: 16,
              fontSize: 13,
              lineHeight: 1.7,
              color: 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
              border: '1px solid var(--border)',
            }}>
              {result.output}
            </div>
            <button
              onClick={onClose}
              style={{
                marginTop: 16,
                width: '100%',
                padding: '10px 0',
                fontSize: 13,
                fontWeight: 500,
                background: 'transparent',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          </section>
        )}
      </div>
    </div>
  )
}
