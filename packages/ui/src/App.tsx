import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Shell } from './components/layout/Shell'
import { WebSocketProvider } from './hooks/useWebSocket'
import { Agents } from './pages/Agents'
import { Bots } from './pages/Bots'
import { Dashboard } from './pages/Dashboard'
import { Landing } from './pages/Landing'
import { MarketDetailPage } from './pages/MarketDetailPage'
import { Markets } from './pages/Markets'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <WebSocketProvider queryClient={queryClient}>
          <BrowserRouter>
            <Routes>
              <Route index element={<ErrorBoundary><Landing /></ErrorBoundary>} />
              <Route path="app" element={<Shell />}>
                <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
                <Route path="markets" element={<ErrorBoundary><Markets /></ErrorBoundary>} />
                <Route path="markets/:marketId" element={<ErrorBoundary><MarketDetailPage /></ErrorBoundary>} />
                <Route path="agents" element={<ErrorBoundary><Agents /></ErrorBoundary>} />
                <Route path="bots" element={<ErrorBoundary><Bots /></ErrorBoundary>} />
              </Route>
            </Routes>
          </BrowserRouter>
        </WebSocketProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
