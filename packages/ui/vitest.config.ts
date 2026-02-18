import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@simulacrum/types': new URL('../types/src/index.ts', import.meta.url).pathname,
    },
  },
})
