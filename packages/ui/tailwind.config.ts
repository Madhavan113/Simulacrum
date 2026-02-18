import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: 'var(--bg-base)',
        surface: 'var(--bg-surface)',
        raised: 'var(--bg-raised)',
        border: 'var(--border)',
        primary: 'var(--text-primary)',
        muted: 'var(--text-muted)',
        dim: 'var(--text-dim)',
        accent: 'var(--accent)',
        'accent-dim': 'var(--accent-dim)',
      },
      fontFamily: {
        sans: ['InterVariable', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: { card: '14px' },
    },
  },
  plugins: [],
} satisfies Config
