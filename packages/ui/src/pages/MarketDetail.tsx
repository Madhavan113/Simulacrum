import { DitherPanel } from '../components/dither/DitherPanel'
import { HashScanLink } from '../components/HashScanLink'
import { OddsBar } from '../components/OddsBar'
import { Sparkline } from '../components/Sparkline'
import { useMarket, useOrderBook } from '../hooks/useMarkets'

interface MarketDetailProps {
  marketId: string
}

export function MarketDetail({ marketId }: MarketDetailProps) {
  const { data: market, isLoading } = useMarket(marketId)
  const { data: orderBook } = useOrderBook(marketId)

  if (isLoading || !market) {
    return (
      <div className="h-full">
        <DitherPanel pattern="bayer4" intensity={0.2} width="100%" height="100%" />
      </div>
    )
  }

  const fakeCount = market.outcomes.reduce<Record<string, number>>((acc, o, i) => {
    acc[o] = i === 0 ? 60 : 40
    return acc
  }, {})

  const fakeSparkline = Array.from({ length: 20 }, (_, i) => Math.sin(i * 0.4) * 30 + 50)

  return (
    <div className="flex flex-col h-full">
      {/* Header band — scanline zone */}
      <div
        className="scanline-zone relative px-6 py-6 shrink-0"
        style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border)', minHeight: 120 }}
      >
        <DitherPanel
          pattern="bayer4"
          intensity={0.08}
          className="absolute inset-0"
        />
        <div className="relative z-10">
          <span className="status-badge mb-3 inline-block" data-status={market.status}>{market.status}</span>
          <h2 className="text-primary font-light leading-snug" style={{ fontSize: 20 }}>{market.question}</h2>
          {market.description && (
            <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>{market.description}</p>
          )}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Odds */}
        <section className="px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="label mb-3">Odds</p>
          <div className="flex items-center justify-between mb-2">
            {market.outcomes.map((o, i) => (
              <div key={o} className="flex flex-col items-center gap-1">
                <span className="text-3xl font-light text-primary">
                  {i === 0 ? '60' : '40'}<span className="text-base text-muted">%</span>
                </span>
                <span className="label" style={{ fontSize: 10 }}>{o}</span>
              </div>
            ))}
          </div>
          <OddsBar outcomes={market.outcomes} counts={fakeCount} height={10} />
        </section>

        {/* Sparkline */}
        <section className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="label mb-3">Volume</p>
          <Sparkline values={fakeSparkline} width={400} height={48} />
        </section>

        {/* Orderbook */}
        {orderBook && (
          <section className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="label mb-3">Order Book</p>
            <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <p className="label mb-2" style={{ fontSize: 10, color: 'var(--accent)' }}>BIDS</p>
                {orderBook.bids.slice(0, 8).map(o => (
                  <div key={o.id} className="flex justify-between py-1" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="font-mono text-xs text-primary">{o.quantity}</span>
                    <span className="font-mono text-xs" style={{ color: 'var(--accent)' }}>{o.price}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="label mb-2" style={{ fontSize: 10, color: 'var(--text-muted)' }}>ASKS</p>
                {orderBook.asks.slice(0, 8).map(o => (
                  <div key={o.id} className="flex justify-between py-1" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="font-mono text-xs text-primary">{o.quantity}</span>
                    <span className="font-mono text-xs text-muted">{o.price}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* On-chain metadata */}
        <section
          className="relative px-6 py-5 scanline-zone"
          style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border)' }}
        >
          <DitherPanel pattern="bayer4" intensity={0.06} className="absolute inset-0" />
          <div className="relative z-10">
            <p className="label mb-3">On-Chain</p>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="label" style={{ fontSize: 10 }}>Topic ID</span>
                <HashScanLink id={market.topicId} url={market.topicUrl} />
              </div>
              {Object.entries(market.outcomeTokenIds).map(([outcome, tokenId]) => (
                <div key={outcome} className="flex items-center justify-between">
                  <span className="label" style={{ fontSize: 10 }}>{outcome} Token</span>
                  <HashScanLink
                    id={tokenId}
                    url={market.outcomeTokenUrls[outcome] ?? '#'}
                  />
                </div>
              ))}
              <div className="flex items-center justify-between">
                <span className="label" style={{ fontSize: 10 }}>Creator</span>
                <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                  {market.creatorAccountId}
                </span>
              </div>
              {market.resolvedOutcome && (
                <div className="flex items-center justify-between">
                  <span className="label" style={{ fontSize: 10 }}>Resolved</span>
                  <span className="font-mono text-xs" style={{ color: 'var(--accent)' }}>
                    {market.resolvedOutcome}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
