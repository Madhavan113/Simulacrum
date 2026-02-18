import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/markets': 'http://localhost:3001',
      '/agents': 'http://localhost:3001',
      '/reputation': 'http://localhost:3001',
      '/autonomy': 'http://localhost:3001',
      '/health': 'http://localhost:3001',
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
})
