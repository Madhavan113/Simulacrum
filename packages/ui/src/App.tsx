import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Shell } from './components/layout/Shell'
import { WebSocketProvider } from './hooks/useWebSocket'
import { Agents } from './pages/Agents'
import { Dashboard } from './pages/Dashboard'
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
    <QueryClientProvider client={queryClient}>
      <WebSocketProvider queryClient={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Dashboard />} />
              <Route path="markets" element={<Markets />} />
              <Route path="agents" element={<Agents />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </WebSocketProvider>
    </QueryClientProvider>
  )
}
