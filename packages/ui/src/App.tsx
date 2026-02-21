import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Shell } from './components/layout/Shell'
import { WebSocketProvider } from './hooks/useWebSocket'
import { Agents } from './pages/Agents'
import { Bots } from './pages/Bots'
import { Dashboard } from './pages/Dashboard'
import { Landing } from './pages/Landing'
import { MarketDetailPage } from './pages/MarketDetailPage'
import { MarketsHub } from './pages/MarketsHub'
import { Onboard } from './pages/Onboard'
import { Publications } from './pages/Publications'
import { Research } from './pages/Research'
import { PredictionsTab } from './pages/tabs/PredictionsTab'
import { DerivativesTab } from './pages/tabs/DerivativesTab'
import { ServicesTab } from './pages/tabs/ServicesTab'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: (failureCount, error) => {
        if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 404) return false
        return failureCount < 2
      },
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
              <Route path="research" element={<ErrorBoundary><Research /></ErrorBoundary>} />
              <Route path="onboard" element={<ErrorBoundary><Onboard /></ErrorBoundary>} />
              <Route path="app" element={<Shell />}>
                <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
                <Route path="markets" element={<ErrorBoundary><MarketsHub /></ErrorBoundary>}>
                  <Route index element={<Navigate to="predictions" replace />} />
                  <Route path="predictions" element={<PredictionsTab />} />
                  <Route path="derivatives" element={<DerivativesTab />} />
                  <Route path="services" element={<ServicesTab />} />
                  <Route path=":marketId" element={<MarketDetailPage />} />
                </Route>
                <Route path="agents" element={<ErrorBoundary><Agents /></ErrorBoundary>} />
                <Route path="bots" element={<ErrorBoundary><Bots /></ErrorBoundary>} />
                <Route path="publications" element={<ErrorBoundary><Publications /></ErrorBoundary>} />
                <Route path="onboard" element={<ErrorBoundary><Onboard /></ErrorBoundary>} />
              </Route>
            </Routes>
          </BrowserRouter>
        </WebSocketProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
