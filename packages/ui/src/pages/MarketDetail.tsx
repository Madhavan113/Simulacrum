import { useEffect, useState } from 'react'
import { HashScanLink } from '../components/HashScanLink'
import { OddsBar } from '../components/OddsBar'
import { useAgents } from '../hooks/useAgents'
import { useMarket, useMarketBets, useOrderBook } from '../hooks/useMarkets'
import { computeImpliedOdds } from '../utils/odds'

interface MarketDetailProps {
  marketId: string
}

function toResolutionCountdownLabel(closeTime: string, status: string, resolvedAt?: string, nowMs = Date.now()): string {
  if (status === 'RESOLVED') {
    return `Resolved ${resolvedAt ? new Date(resolvedAt).toLocaleString() : 'recently'}`
  }

  const resolveAtMs = Date.parse(closeTime)
  if (!Number.isFinite(resolveAtMs)) {
    return 'Resolution time unavailable'
  }

  const msUntilResolution = resolveAtMs - nowMs
  if (msUntilResolution <= 0) {
    return 'Resolution pending'
  }

  const totalSeconds = Math.floor(msUntilResolution / 1000)
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) {
    return `Resolves in ${days}d ${hours}h`
  }

  if (hours > 0) {
    return `Resolves in ${hours}h ${minutes}m`
  }

  if (minutes > 0) {
    return `Resolves in ${minutes}m ${seconds}s`
  }

  return `Resolves in ${seconds}s`
}

export function MarketDetail({ marketId }: MarketDetailProps) {
  const { data: market, isLoading } = useMarket(marketId)
  const { data: betSnapshot } = useMarketBets(marketId)
  const { data: orderBook } = useOrderBook(marketId)
  const { data: agents = [] } = useAgents()
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!market || market.status === 'RESOLVED') {
      return
    }

    const timer = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1_000)

    return () => window.clearInterval(timer)
  }, [market?.id, market?.status])

  if (isLoading || !market) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="label">Loading…</span>
      </div>
    )
  }

  const odds = computeImpliedOdds({
    outcomes: market.outcomes,
    orderBook,
    initialOddsByOutcome: market.initialOddsByOutcome,
    stakeByOutcome: betSnapshot?.stakeByOutcome,
    resolvedOutcome: market.resolvedOutcome,
  })
  const isDemoMarket = market.question.startsWith('[DEMO]')
  const openOrderCount = orderBook?.orders.filter(order => order.status === 'OPEN').length ?? 0
  const totalStakedHbar = betSnapshot?.totalStakedHbar ?? 0
  const hasStakeSignal = totalStakedHbar > 0
  const hasOrderbookSignal = openOrderCount > 0
  const pricingSignalLabel = hasStakeSignal
    ? 'Stake-weighted with order-book depth as a secondary signal'
    : hasOrderbookSignal
      ? 'Seed odds blended with thin order-book depth'
      : 'Seed listing odds'
  const closeTimerLabel = toResolutionCountdownLabel(market.closeTime, market.status, market.resolvedAt, nowMs)
  const challenges = market.challenges ?? []
  const oracleVotes = market.oracleVotes ?? []
  const hasDisputeLog = market.status === 'DISPUTED' || Boolean(market.selfAttestation) || challenges.length > 0 || oracleVotes.length > 0
  const accountNameById = agents.reduce<Record<string, string>>((acc, agent) => {
    acc[agent.accountId] = agent.name
    return acc
  }, {})
  const sortedVotes = [...oracleVotes].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  const sortedChallenges = [...challenges].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))

  const stakeByOutcome = Object.fromEntries(
    market.outcomes.map(outcome => [outcome, betSnapshot?.stakeByOutcome?.[outcome] ?? 0]),
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="px-6 py-6 shrink-0"
        style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border)', minHeight: 120 }}
      >
        <span className="status-badge mb-3 inline-block" data-status={market.status}>{market.status}</span>
        {isDemoMarket && (
          <span
            className="label ml-2 inline-block"
            style={{
              fontSize: 10,
              color: '#ffb74d',
              border: '1px solid #ffb74d',
              borderRadius: 4,
              padding: '2px 8px',
            }}
          >
            DEMO
          </span>
        )}
        <h2 className="text-primary font-light leading-snug" style={{ fontSize: 20 }}>{market.question}</h2>
        {market.description && (
          <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>{market.description}</p>
        )}
        <p className="label mt-2" style={{ fontSize: 10 }}>
          {closeTimerLabel}
        </p>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Odds */}
        <section className="px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="label mb-3">Odds</p>
          <div className="flex items-center justify-between mb-2">
            {market.outcomes.map(o => (
              <div key={o} className="flex flex-col items-center gap-1">
                <span className="text-3xl font-light text-primary">
                  {odds[o] ?? 0}<span className="text-base text-muted">%</span>
                </span>
                <span className="label" style={{ fontSize: 10 }}>{o}</span>
              </div>
            ))}
          </div>
          <OddsBar outcomes={market.outcomes} counts={odds} height={10} />
          <p className="label mt-3" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {pricingSignalLabel}
          </p>
        </section>

        {/* Staked volume */}
        <section className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="label mb-3">Staked Volume</p>
          <div className="flex items-center justify-between mb-3">
            <span className="label" style={{ fontSize: 10 }}>
              {betSnapshot?.betCount ?? 0} bets
            </span>
            <span className="font-mono text-xs text-primary">
              {totalStakedHbar.toFixed(2)} HBAR
            </span>
          </div>
          {market.outcomes.map(outcome => (
            <div
              key={outcome}
              className="flex items-center justify-between py-1"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <span className="font-mono text-xs text-primary">{outcome}</span>
              <span className="font-mono text-xs text-primary">
                {(stakeByOutcome[outcome] ?? 0).toFixed(2)} HBAR
              </span>
            </div>
          ))}
        </section>

        {/* Orderbook */}
        {orderBook && (
          <section className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="label mb-3">Order Book (Depth)</p>
            <div className="flex items-center justify-between mb-3">
              <span className="label" style={{ fontSize: 10 }}>
                {openOrderCount} open orders
              </span>
              <span className="label" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                Orders are community-bot sourced
              </span>
            </div>
            <div className="flex flex-col gap-1 mb-4">
              {orderBook.orders.slice(-4).reverse().map(order => (
                <div key={order.id} className="flex items-center justify-between py-1" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="font-mono text-xs text-primary">{order.outcome}</span>
                  <span className="label text-xs" style={{ color: order.side === 'BID' ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {order.side}
                  </span>
                  <span className="font-mono text-xs text-primary">{order.quantity}</span>
                  <span className="font-mono text-xs text-primary">{order.price.toFixed(2)}</span>
                  <span className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>
                    {order.accountId}
                  </span>
                </div>
              ))}
            </div>
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

        {/* Dispute log */}
        {hasDisputeLog && (
          <section className="px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="label mb-3">Dispute Log</p>
            {market.selfAttestation && (
              <div className="mb-4 p-3" style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-raised)' }}>
                <p className="label mb-1" style={{ fontSize: 10 }}>SELF-ATTESTATION</p>
                <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                  {accountNameById[market.selfAttestation.attestedByAccountId] ?? market.selfAttestation.attestedByAccountId} proposed{' '}
                  <span className="text-primary">{market.selfAttestation.proposedOutcome}</span>
                </p>
                {market.selfAttestation.reason && (
                  <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    {market.selfAttestation.reason}
                  </p>
                )}
                {market.challengeWindowEndsAt && (
                  <p className="label mt-2" style={{ fontSize: 10 }}>
                    Challenge window ends {new Date(market.challengeWindowEndsAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            <div className="mb-4">
              <p className="label mb-2" style={{ fontSize: 10 }}>CHALLENGES ({sortedChallenges.length})</p>
              {sortedChallenges.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>No formal challenges submitted.</p>
              ) : (
                sortedChallenges.map(challenge => (
                  <div key={challenge.id} className="py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                    <p className="text-xs text-primary">
                      {accountNameById[challenge.challengerAccountId] ?? challenge.challengerAccountId} challenged with {challenge.proposedOutcome}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{challenge.reason}</p>
                    <p className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>
                      {new Date(challenge.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div>
              <p className="label mb-2" style={{ fontSize: 10 }}>ORACLE VOTES ({sortedVotes.length})</p>
              {sortedVotes.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>No oracle votes recorded yet.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {sortedVotes.map(vote => {
                    const isResolved = Boolean(market.resolvedOutcome)
                    const isCorrect = market.resolvedOutcome ? vote.outcome === market.resolvedOutcome : false
                    const reputationEffect = isResolved ? (isCorrect ? '+6' : '-4') : 'pending'
                    return (
                      <div key={vote.id} className="grid gap-2 py-1" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', borderBottom: '1px solid var(--border)' }}>
                        <span className="font-mono text-xs text-primary truncate">
                          {accountNameById[vote.voterAccountId] ?? vote.voterAccountId}
                        </span>
                        <span className="font-mono text-xs text-primary">{vote.outcome}</span>
                        <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{Math.round(vote.confidence * 100)}%</span>
                        <span className="font-mono text-xs" style={{ color: isCorrect ? 'var(--accent)' : isResolved ? '#ff8a80' : 'var(--text-dim)' }}>
                          {reputationEffect}
                        </span>
                        <span className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>
                          {new Date(vote.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* On-chain metadata */}
        <section
          className="px-6 py-5"
          style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border)' }}
        >
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
              <HashScanLink
                id={market.creatorAccountId}
                url={`https://hashscan.io/testnet/account/${market.creatorAccountId}`}
              />
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
        </section>
      </div>
    </div>
  )
}
