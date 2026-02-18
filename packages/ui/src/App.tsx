import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Shell } from './components/layout/Shell'
import { WebSocketProvider } from './hooks/useWebSocket'
import { Agents } from './pages/Agents'
import { Bots } from './pages/Bots'
import { Dashboard } from './pages/Dashboard'
import { Landing } from './pages/Landing'
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
            <Route index element={<Landing />} />
            <Route path="app" element={<Shell />}>
              <Route index element={<Dashboard />} />
              <Route path="markets" element={<Markets />} />
              <Route path="agents" element={<Agents />} />
              <Route path="bots" element={<Bots />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </WebSocketProvider>
    </QueryClientProvider>
  )
}
