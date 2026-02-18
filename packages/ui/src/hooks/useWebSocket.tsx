import { type QueryClient } from '@tanstack/react-query'
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { WsEvent } from '../api/types'

type WsStatus = 'connecting' | 'connected' | 'disconnected'

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

// Events that should invalidate TanStack Query caches
function invalidateFromEvent(queryClient: QueryClient, event: WsEvent) {
  const { type, payload } = event
  const p = payload as Record<string, unknown>

  switch (type) {
    case 'market.created':
      void queryClient.invalidateQueries({ queryKey: ['markets'] })
      break
    case 'market.bet':
    case 'market.resolved':
    case 'market.claimed':
    case 'market.order':
      void queryClient.invalidateQueries({ queryKey: ['markets'] })
      if (p.marketId) {
        void queryClient.invalidateQueries({ queryKey: ['markets', p.marketId] })
        void queryClient.invalidateQueries({ queryKey: ['orderbook', p.marketId] })
      }
      break
    case 'agent.created':
      void queryClient.invalidateQueries({ queryKey: ['agents'] })
      break
    case 'reputation.attested':
    case 'reputation.token.created':
      void queryClient.invalidateQueries({ queryKey: ['reputation'] })
      break
    default:
      break
  }
}

export function WebSocketProvider({ queryClient, children }: WebSocketProviderProps) {
  const [status, setStatus] = useState<WsStatus>('connecting')
  const listenersRef = useRef<Set<(event: WsEvent) => void>>(new Set())
  const wsRef = useRef<WebSocket | null>(null)

  function subscribe(listener: (event: WsEvent) => void) {
    listenersRef.current.add(listener)
    return () => { listenersRef.current.delete(listener) }
  }

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>

    function connect() {
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${protocol}://${location.host}/ws`)
      wsRef.current = ws

      ws.onopen = () => setStatus('connected')

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
        setStatus('disconnected')
        reconnectTimer = setTimeout(connect, 3000)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      clearTimeout(reconnectTimer)
      wsRef.current?.close()
    }
  }, [queryClient])

  return (
    <WsContext.Provider value={{ status, subscribe }}>
      {children}
    </WsContext.Provider>
  )
}
