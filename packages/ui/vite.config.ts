import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const API_TARGET = process.env.SIMULACRUM_API_ORIGIN ?? 'http://127.0.0.1:3001'
const WS_TARGET = API_TARGET.replace(/^http/i, 'ws')

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/markets': API_TARGET,
      '/agents': API_TARGET,
      '/reputation': API_TARGET,
      '/autonomy': API_TARGET,
      '/clawdbots': API_TARGET,
      '/health': API_TARGET,
      '/insurance': API_TARGET,
      '/ws': { target: WS_TARGET, ws: true },
    },
  },
})
