import { useMemo, useState } from 'react'
import { Tabs, EmptyState } from '../../components/ui'
import { PositionRow } from '../../components/derivatives/PositionRow'
import { OptionCard } from '../../components/derivatives/OptionCard'
import { MarginPanel } from '../../components/derivatives/MarginPanel'
import { FundingRateBar } from '../../components/derivatives/FundingRateBar'
import { usePositions, useOptions, useDerivativesOverview } from '../../hooks/useDerivatives'
import { useMarkets } from '../../hooks/useMarkets'
import { useClawdbots } from '../../hooks/useClawdbots'

const subTabs = [
  { id: 'perpetuals', label: 'Perpetuals' },
  { id: 'options', label: 'Options' },
]

export function DerivativesTab() {
  const [sub, setSub] = useState('perpetuals')
  const { data: positions = [] } = usePositions()
  const { data: options = [] } = useOptions()
  const { data: overview } = useDerivativesOverview()
  const { data: markets = [] } = useMarkets()
  const { data: bots = [] } = useClawdbots()

  const marketQuestions = useMemo(() => {
    const map: Record<string, string> = {}
    for (const m of markets) map[m.id] = m.question
    return map
  }, [markets])

  const agentNames = useMemo(() => {
    const map: Record<string, string> = {}
    for (const b of bots) map[b.accountId] = b.name
    return map
  }, [bots])

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <Tabs tabs={subTabs} activeId={sub} onChange={setSub} className="border-b-0" />
          {overview && (
            <div className="flex items-center gap-4">
              <FundingRateBar rates={overview.recentFundingRates} />
              <span className="label" style={{ fontSize: 11 }}>
                OI: {overview.totalOpenInterestHbar.toFixed(1)} HBAR
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {sub === 'perpetuals' && (
            <>
              {positions.length === 0 ? (
                <EmptyState message="No open positions" sub="Positions will appear here when agents open perpetual trades" />
              ) : (
                <div className="flex flex-col">
                  <div
                    className="grid px-4 py-2"
                    style={{
                      gridTemplateColumns: '1fr 80px 80px 90px 90px 90px 60px 90px',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    {['Market', 'Side', 'Size', 'Entry', 'Mark', 'PnL', 'Lev', 'Liq. Price'].map(h => (
                      <span key={h} className="label" style={{ fontSize: 10 }}>{h}</span>
                    ))}
                  </div>
                  {positions.map(p => <PositionRow key={p.id} position={p} marketQuestion={marketQuestions[p.marketId]} agentName={agentNames[p.accountId]} />)}
                </div>
              )}
            </>
          )}

          {sub === 'options' && (
            <>
              {options.length === 0 ? (
                <EmptyState message="No option contracts" sub="Options will appear here when agents write or buy contracts" />
              ) : (
                <div className="grid gap-3 p-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                  {options.map(o => <OptionCard key={o.id} option={o} marketQuestion={marketQuestions[o.marketId]} agentNames={agentNames} />)}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <aside
        className="flex-shrink-0 overflow-y-auto"
        style={{ width: 280, borderLeft: '1px solid var(--border)' }}
      >
        <MarginPanel />
      </aside>
    </div>
  )
}
