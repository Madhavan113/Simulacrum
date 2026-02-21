import type { Agent } from '../api/types'
import { useAgentPortfolio } from '../hooks/useAgents'
import { HashScanLink } from './HashScanLink'
import { PnLCell } from './derivatives/PnLCell'

export function AgentDrawerContent({ agent }: { agent: Agent }) {
  const accountId = agent.walletAccountId ?? agent.accountId
  const { data: portfolio, isLoading } = useAgentPortfolio(accountId)
  const isPlatform = agent.origin === 'platform'

  const openPerps = portfolio?.positions.filter(p => p.status === 'OPEN' || p.status === 'CLOSING') ?? []
  const closedPerps = portfolio?.positions.filter(p => p.status === 'CLOSED' || p.status === 'LIQUIDATED') ?? []
  const openOptionsHeld = portfolio?.optionsHeld.filter(o => o.status === 'ACTIVE') ?? []
  const openOptionsWritten = portfolio?.optionsWritten.filter(o => o.status === 'ACTIVE') ?? []
  const openOptionsCount = openOptionsHeld.length + openOptionsWritten.length

  const perpRealizedPnl = closedPerps.reduce((s, p) => s + (p.realizedPnlHbar ?? 0), 0)
  const serviceIncome = portfolio?.services.reduce((s, svc) => s + svc.priceHbar * svc.completedCount, 0) ?? 0
  const realizedPnl = perpRealizedPnl + serviceIncome

  const perpUnrealizedPnl = openPerps.reduce((s, p) => s + p.unrealizedPnlHbar, 0)
  const optionsHeldPnl = openOptionsHeld.reduce((s, o) => s + (o.holderPnlHbar ?? 0), 0)
  const optionsWrittenPnl = openOptionsWritten.reduce((s, o) => s + (o.writerPnlHbar ?? 0), 0)
  const unrealizedPnl = perpUnrealizedPnl + optionsHeldPnl + optionsWrittenPnl

  const totalPnl = realizedPnl + unrealizedPnl

  const optionsNetValue =
    openOptionsHeld.reduce((s, o) => s + (o.holderPnlHbar ?? o.premiumHbar), 0) +
    openOptionsWritten.reduce((s, o) => s + (o.writerPnlHbar ?? -o.premiumHbar), 0)

  return (
    <div className="flex flex-col h-full">
      <div
        className="px-6 py-5 shrink-0"
        style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border)' }}
      >
        <p className="label" style={{ fontSize: 10 }}>{accountId}</p>
        <h2 className="text-primary font-light" style={{ fontSize: 24, marginTop: 2 }}>{agent.name}</h2>
        <div className="flex items-center gap-2 mt-2">
          <Tag>{agent.strategy}</Tag>
          {isPlatform && agent.status && (
            <Tag color={agent.status === 'ACTIVE' ? '#22c55e' : undefined}>{agent.status}</Tag>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <Section title="Portfolio"><p className="label" style={{ fontSize: 11 }}>Loading...</p></Section>}

        <Section title="PnL">
          <div className="flex items-baseline justify-between mb-4">
            <span className="label" style={{ fontSize: 10 }}>Total</span>
            <PnLCell value={totalPnl} />
          </div>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="label" style={{ fontSize: 10 }}>Realized</span>
            <PnLCell value={realizedPnl} />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="label" style={{ fontSize: 10 }}>Unrealized</span>
            <PnLCell value={unrealizedPnl} />
          </div>
        </Section>

        <Section title="Holdings">
          <StatRow label="Reputation" value={`${agent.reputationScore} / 100`} />
          <div className="w-full overflow-hidden rounded-sm" style={{ height: 5, background: 'var(--bg-raised)', marginBottom: 8 }}>
            <div style={{ width: `${agent.reputationScore}%`, height: '100%', background: 'var(--accent-dim)' }} />
          </div>
          <StatRow label="Bankroll" value={isPlatform ? 'on-chain' : `${agent.bankrollHbar.toFixed(2)} HBAR`} />
          {portfolio?.marginAccount && (
            <>
              <StatRow label="Margin Balance" value={`${portfolio.marginAccount.balanceHbar.toFixed(2)} HBAR`} />
              <StatRow label="Margin Locked" value={`${portfolio.marginAccount.lockedHbar.toFixed(2)} HBAR`} />
            </>
          )}
          <StatRow label="Open Perps" value={openPerps.length > 0
            ? `${openPerps.length} pos · ${perpUnrealizedPnl >= 0 ? '+' : ''}${perpUnrealizedPnl.toFixed(2)} HBAR`
            : 'None'
          } />
          <StatRow label="Open Options" value={openOptionsCount > 0
            ? `${openOptionsCount} pos · ${optionsNetValue >= 0 ? '+' : ''}${optionsNetValue.toFixed(2)} HBAR`
            : 'None'
          } />
        </Section>

        <Section title="On-Chain" bg>
          <div className="flex items-center justify-between">
            <span className="label" style={{ fontSize: 10 }}>View on Hashscan</span>
            <HashScanLink id={accountId} url={`https://hashscan.io/testnet/account/${accountId}`} />
          </div>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children, bg }: { title: string; children: React.ReactNode; bg?: boolean }) {
  return (
    <section className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)', background: bg ? 'var(--bg-raised)' : undefined }}>
      <p className="label mb-3">{title}</p>
      {children}
    </section>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between mb-1.5">
      <span className="label" style={{ fontSize: 10 }}>{label}</span>
      <span className="font-mono text-xs text-primary">{value}</span>
    </div>
  )
}

function Tag({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="label inline-block"
      style={{
        fontSize: 10,
        background: color ? `${color}15` : 'var(--bg-raised)',
        color: color ?? 'var(--text-dim)',
        border: '1px solid var(--border)',
        padding: '2px 8px',
        borderRadius: 4,
      }}
    >
      {children}
    </span>
  )
}
