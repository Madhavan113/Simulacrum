import { type QueryClient } from '@tanstack/react-query'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { WsEvent } from '../api/types'

export type WsStatus = 'connecting' | 'connected' | 'disconnected'

interface WsContextValue {
  status: WsStatus
  /** Subscribe to raw events — returns unsubscribe fn */
  subscribe: (listener: (event: WsEvent) => void) => () => void
}

const WsContext = createContext<WsContextValue>({
  status: 'disconnected',
  subscribe: () => () => {},
})

export function useWebSocket() {
  return useContext(WsContext)
}

interface WebSocketProviderProps {
  queryClient: QueryClient
  children: ReactNode
}

function toWebSocketUrl(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
    return trimmed
  }
  if (trimmed.startsWith('http://')) {
    return `ws://${trimmed.slice('http://'.length)}`
  }
  if (trimmed.startsWith('https://')) {
    return `wss://${trimmed.slice('https://'.length)}`
  }
  return trimmed
}

function resolveWebSocketCandidates(): string[] {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const sameOrigin = `${protocol}://${window.location.host}/ws`
  const configured = import.meta.env.VITE_WS_URL
    ? toWebSocketUrl(import.meta.env.VITE_WS_URL as string)
    : undefined
  const isLocalhost =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

  const urls = [
    configured,
    import.meta.env.DEV && isLocalhost ? `${protocol}://127.0.0.1:3001/ws` : undefined,
    import.meta.env.DEV && isLocalhost ? `${protocol}://localhost:3001/ws` : undefined,
    sameOrigin,
  ].filter((value): value is string => Boolean(value))

  return Array.from(new Set(urls))
}

// Events that should invalidate TanStack Query caches
function invalidateFromEvent(queryClient: QueryClient, event: WsEvent) {
  const { type, payload } = event
  const p = payload as Record<string, unknown>

  // Helper: invalidate market-related keys
  function invalidateMarket() {
    void queryClient.invalidateQueries({ queryKey: ['markets'] })
    if (p.marketId) {
      void queryClient.invalidateQueries({ queryKey: ['markets', p.marketId] })
      void queryClient.invalidateQueries({ queryKey: ['market-bets', p.marketId] })
      void queryClient.invalidateQueries({ queryKey: ['orderbook', p.marketId] })
    }
  }

  switch (type) {
    // Core market events
    case 'market.created':
    case 'autonomy.market.created':
    case 'clawdbot.market.created':
      void queryClient.invalidateQueries({ queryKey: ['markets'] })
      break

    case 'market.bet':
    case 'market.closed':
    case 'market.resolved':
    case 'market.claimed':
    case 'market.order':
    case 'market.self_attested':
    case 'market.challenged':
    case 'market.oracle_vote':
    case 'autonomy.bet.placed':
    case 'autonomy.market.resolved':
    case 'autonomy.market.claimed':
    case 'clawdbot.bet.placed':
    case 'clawdbot.order.placed':
    case 'clawdbot.bet.external':
    case 'clawdbot.market.resolved':
    case 'clawdbot.resolve.external':
    case 'clawdbot.market.claimed':
      invalidateMarket()
      break

    // Agent events
    case 'agent.created':
    case 'autonomy.agent.created':
      void queryClient.invalidateQueries({ queryKey: ['agents'] })
      break

    // Bot spawned/joined — update both agents list and clawdbots queries
    case 'clawdbot.spawned':
    case 'clawdbot.joined':
      void queryClient.invalidateQueries({ queryKey: ['agents'] })
      void queryClient.invalidateQueries({ queryKey: ['clawdbots'] })
      break

    // ClawDBot network lifecycle + thread messages
    case 'clawdbot.message':
    case 'clawdbot.started':
    case 'clawdbot.stopped':
    case 'clawdbot.tick':
    case 'clawdbot.goal.created':
    case 'clawdbot.goal.updated':
    case 'clawdbot.goal.completed':
    case 'clawdbot.goal.failed':
    case 'clawdbot.funded':
      void queryClient.invalidateQueries({ queryKey: ['clawdbots'] })
      break

    // Autonomy engine lifecycle
    case 'autonomy.started':
    case 'autonomy.stopped':
    case 'autonomy.tick':
      void queryClient.invalidateQueries({ queryKey: ['autonomy'] })
      break

    // Reputation
    case 'reputation.attested':
    case 'reputation.token.created':
      void queryClient.invalidateQueries({ queryKey: ['reputation'] })
      break

    // Research engine
    case 'research.started':
    case 'research.stopped':
    case 'research.tick':
      void queryClient.invalidateQueries({ queryKey: ['research', 'status'] })
      break
    case 'research.publication.published':
    case 'research.publication.retracted':
      void queryClient.invalidateQueries({ queryKey: ['research'] })
      break
    case 'research.pipeline.advanced':
    case 'research.evaluation.complete':
      void queryClient.invalidateQueries({ queryKey: ['research'] })
      break
    case 'research.observation.batch':
      void queryClient.invalidateQueries({ queryKey: ['research', 'observations'] })
      break

    // Derivatives: options mark-to-market and funding events
    case 'derivatives.options_refreshed':
    case 'derivatives.options_expired':
    case 'derivatives.option.written':
    case 'derivatives.option.bought':
      void queryClient.invalidateQueries({ queryKey: ['derivatives', 'options'] })
      void queryClient.invalidateQueries({ queryKey: ['derivatives', 'overview'] })
      break
    case 'derivatives.funding_settled':
      void queryClient.invalidateQueries({ queryKey: ['derivatives'] })
      break

    default:
      // Wildcard: any autonomy.market.* or clawdbot.market.* → invalidate markets
      if (type.startsWith('autonomy.market') || type.startsWith('clawdbot.market')) {
        invalidateMarket()
      }
      if (type.startsWith('derivatives.')) {
        void queryClient.invalidateQueries({ queryKey: ['derivatives'] })
      }
      break
  }
}

export function WebSocketProvider({ queryClient, children }: WebSocketProviderProps) {
  const [status, setStatus] = useState<WsStatus>('connecting')
  const listenersRef = useRef<Set<(event: WsEvent) => void>>(new Set())
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectDelayMsRef = useRef(1_500)

  const subscribe = useCallback((listener: (event: WsEvent) => void) => {
    listenersRef.current.add(listener)
    return () => { listenersRef.current.delete(listener) }
  }, [])

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>
    let destroyed = false
    let candidateIndex = 0

    function connect() {
      const candidates = resolveWebSocketCandidates()
      const wsUrl = candidates[candidateIndex] ?? candidates[0]

      if (!wsUrl) {
        setStatus('disconnected')
        if (!destroyed) reconnectTimer = setTimeout(connect, reconnectDelayMsRef.current)
        return
      }

      setStatus('connecting')
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws
      let opened = false

      ws.onopen = () => {
        opened = true
        candidateIndex = 0
        reconnectDelayMsRef.current = 1_500
        setStatus('connected')
      }

      ws.onmessage = (msg: MessageEvent<string>) => {
        try {
          const event = JSON.parse(msg.data) as WsEvent
          invalidateFromEvent(queryClient, event)
          for (const listener of listenersRef.current) {
            listener(event)
          }
        } catch {
          // malformed message — ignore
        }
      }

      ws.onclose = () => {
        if (!opened && candidateIndex < candidates.length - 1) {
          candidateIndex += 1
          connect()
          return
        }

        setStatus('disconnected')
        if (!destroyed) {
          reconnectTimer = setTimeout(() => {
            candidateIndex = 0
            connect()
          }, reconnectDelayMsRef.current)
          reconnectDelayMsRef.current = Math.min(reconnectDelayMsRef.current * 2, 10_000)
        }
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      destroyed = true
      clearTimeout(reconnectTimer)
      wsRef.current?.close()
    }
  }, [queryClient])

  const contextValue = useMemo<WsContextValue>(() => ({ status, subscribe }), [status, subscribe])

  return (
    <WsContext.Provider value={contextValue}>
      {children}
    </WsContext.Provider>
  )
}
