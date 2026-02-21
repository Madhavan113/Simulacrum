import { useState } from 'react'
import type { Service, MoltBookBuyResult } from '../../api/services'
import { servicesApi } from '../../api/services'

interface BuyServiceDrawerProps {
  service: Service
  agentName?: string
  availableWallets: Array<{ accountId: string; name: string }>
  onClose: () => void
}

type WalletMode = 'agent' | 'external'

export function BuyServiceDrawer({ service, agentName, availableWallets, onClose }: BuyServiceDrawerProps) {
  const eligible = availableWallets.filter(w => w.accountId !== service.providerAccountId)
  const [walletMode, setWalletMode] = useState<WalletMode>(eligible.length > 0 ? 'agent' : 'external')
  const [selectedWallet, setSelectedWallet] = useState(eligible[0]?.accountId ?? '')
  const [externalAccountId, setExternalAccountId] = useState('')
  const [externalPrivateKey, setExternalPrivateKey] = useState('')
  const [keyType, setKeyType] = useState<'der' | 'ecdsa' | 'ed25519'>('der')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<MoltBookBuyResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const payerAccountId = walletMode === 'agent' ? selectedWallet : externalAccountId.trim()
  const canSubmit = input.trim() && payerAccountId && (walletMode === 'agent' || externalPrivateKey.trim())

  const handleBuy = async () => {
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    try {
      const pk = walletMode === 'external' ? externalPrivateKey.trim() : undefined
      const kt = walletMode === 'external' ? keyType : undefined
      const res = await servicesApi.buy(service.id, input.trim(), payerAccountId, pk, kt)
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
            <p className="label mb-2">Pay from</p>
            <div className="flex gap-2 mb-3">
              {eligible.length > 0 && (
                <ModeButton active={walletMode === 'agent'} onClick={() => setWalletMode('agent')}>Agent Wallet</ModeButton>
              )}
              <ModeButton active={walletMode === 'external'} onClick={() => setWalletMode('external')}>Your Hedera Account</ModeButton>
            </div>

            {walletMode === 'agent' && (
              <select
                value={selectedWallet}
                onChange={(e) => setSelectedWallet(e.target.value)}
                disabled={loading}
                style={fieldStyle}
              >
                {eligible.map(w => (
                  <option key={w.accountId} value={w.accountId}>
                    {w.name} ({w.accountId})
                  </option>
                ))}
              </select>
            )}

            {walletMode === 'external' && (
              <div className="flex flex-col gap-2">
                <input
                  value={externalAccountId}
                  onChange={(e) => setExternalAccountId(e.target.value)}
                  placeholder="Account ID (e.g. 0.0.1234567)"
                  disabled={loading}
                  style={fieldStyle}
                />
                <input
                  type="password"
                  value={externalPrivateKey}
                  onChange={(e) => setExternalPrivateKey(e.target.value)}
                  placeholder="Private key (DER hex, ECDSA, or ED25519)"
                  disabled={loading}
                  style={fieldStyle}
                />
                <select value={keyType} onChange={(e) => setKeyType(e.target.value as typeof keyType)} disabled={loading} style={{ ...fieldStyle, width: 'auto' }}>
                  <option value="der">DER (default)</option>
                  <option value="ecdsa">ECDSA</option>
                  <option value="ed25519">ED25519</option>
                </select>
                <p style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.4 }}>
                  Testnet only. Your key is sent over HTTPS and used once to sign the transfer. It is not stored.
                </p>
              </div>
            )}

            <p className="label mb-2 mt-4">What do you need?</p>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe your request in detail..."
              disabled={loading}
              rows={4}
              style={{
                ...fieldStyle,
                minHeight: 80,
                resize: 'vertical',
                lineHeight: 1.5,
              }}
            />
            {error && <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>{error}</p>}
            <button
              onClick={handleBuy}
              disabled={loading || !canSubmit}
              style={{
                marginTop: 12,
                width: '100%',
                padding: '10px 0',
                fontSize: 13,
                fontWeight: 600,
                background: loading ? 'var(--bg-raised)' : (canSubmit ? 'var(--accent)' : 'var(--bg-raised)'),
                color: loading || !canSubmit ? 'var(--text-dim)' : '#000',
                border: 'none',
                borderRadius: 6,
                cursor: loading ? 'wait' : (canSubmit ? 'pointer' : 'default'),
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

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 12,
  fontFamily: 'inherit',
  background: 'var(--bg-raised)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  outline: 'none',
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px',
        fontSize: 11,
        fontWeight: 500,
        background: active ? 'var(--accent-dim)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-dim)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 4,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
