# Simulacrum UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `packages/ui` — a production Vite + React 18 SPA that is the operator interface for Simulacrum, wired to the real `packages/api` Express server.

**Architecture:** Vite dev server proxies all API calls and the `/ws` WebSocket to `localhost:3001`. TanStack Query owns all server state; a single `useWebSocket` hook drives cache invalidation from real-time events. The visual identity is black-first with ordered dither mosaics, CRT scanlines, and a canvas-based macroblock reveal transition.

**Tech Stack:** Vite 5, React 18, TypeScript 5, TailwindCSS 3, TanStack Query 5, React Router 6, D3 7, @fontsource-variable/inter

---

### Task 1: Scaffold `packages/ui`

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/vite.config.ts`
- Create: `packages/ui/tailwind.config.ts`
- Create: `packages/ui/postcss.config.js`
- Create: `packages/ui/index.html`
- Create: `packages/ui/src/main.tsx`
- Create: `packages/ui/src/App.tsx`

**Step 1: Create `packages/ui/package.json`**

```json
{
  "name": "@simulacrum/ui",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@fontsource-variable/inter": "^5.1.0",
    "@tanstack/react-query": "^5.62.0",
    "d3": "^7.9.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.27.0"
  },
  "devDependencies": {
    "@types/d3": "^7.4.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.15",
    "typescript": "^5.6.0",
    "vite": "^5.4.0"
  }
}
```

**Step 2: Create `packages/ui/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src"]
}
```

**Step 3: Create `packages/ui/vite.config.ts`**

```ts
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
```

**Step 4: Create `packages/ui/tailwind.config.ts`**

```ts
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
```

**Step 5: Create `packages/ui/postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

**Step 6: Create `packages/ui/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Simulacrum</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 7: Create `packages/ui/src/main.tsx`**

```tsx
import '@fontsource-variable/inter'
import './styles/globals.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

**Step 8: Create `packages/ui/src/App.tsx` (stub — will be replaced in Task 7)**

```tsx
export default function App() {
  return <div className="bg-base min-h-screen text-primary">Simulacrum</div>
}
```

**Step 9: Install dependencies and verify dev server starts**

```bash
cd /Users/madhavanp/Downloads/hederamarkets/ethdenver/packages/ui
pnpm install
pnpm dev
```

Expected: Vite starts at `http://localhost:5173`, page renders "Simulacrum" on a dark background. No TypeScript errors.

**Step 10: Commit**

```bash
cd /Users/madhavanp/Downloads/hederamarkets/ethdenver
git add packages/ui
git commit -m "feat(ui): scaffold Vite + React + Tailwind package"
```

---

### Task 2: Design System CSS

**Files:**
- Create: `packages/ui/src/styles/globals.css`

**Step 1: Create `packages/ui/src/styles/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --bg-base:      #0D0D0D;
    --bg-surface:   #141414;
    --bg-raised:    #1A1A1A;
    --border:       #2A2A2A;
    --text-primary: #F0EDE8;
    --text-muted:   #6B6460;
    --text-dim:     #3D3A38;
    --accent:       #D4917A;
    --accent-dim:   #8C5A47;
    --dither-hi:    #E8E4DF;
    --dither-lo:    #1E1C1A;
  }

  *, *::before, *::after { box-sizing: border-box; }

  html { font-family: InterVariable, Inter, system-ui, sans-serif; }

  body {
    background: var(--bg-base);
    color: var(--text-primary);
    margin: 0;
    -webkit-font-smoothing: antialiased;
  }

  /* 8px baseline grid helper */
  * { margin: 0; padding: 0; }
}

@layer components {
  /* CRT scanline overlay — apply .scanline-zone to a position:relative element */
  .scanline-zone {
    position: relative;
    overflow: hidden;
  }

  .scanline-zone::after {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0, 0, 0, 0.18) 2px,
      rgba(0, 0, 0, 0.18) 3px
    );
    pointer-events: none;
    z-index: 10;
  }

  /* Hairline border utility */
  .border-hair { border: 1px solid var(--border); }

  /* Label metadata style */
  .label {
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  /* Editorial title */
  .editorial {
    font-size: clamp(28px, 4vw, 48px);
    font-weight: 300;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }

  /* Status badge */
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border: 1px solid var(--border);
    background: var(--bg-raised);
    color: var(--text-muted);
  }

  .status-badge[data-status="OPEN"]     { border-color: var(--accent-dim); color: var(--accent); }
  .status-badge[data-status="RESOLVED"] { border-color: #3A4A3A; color: #6B8F6B; }
  .status-badge[data-status="DISPUTED"] { border-color: #4A3A2A; color: #C4845A; }
  .status-badge[data-status="CLOSED"]   { border-color: var(--border); color: var(--text-dim); }
}
```

**Step 2: Verify Tailwind picks up the CSS — check `pnpm dev` and inspect the page**

Expected: Body has `background: #0D0D0D`, no console errors.

**Step 3: Commit**

```bash
git add packages/ui/src/styles/globals.css
git commit -m "feat(ui): design system CSS tokens, scanline utility, typography"
```

---

### Task 3: Dither Pattern Library

**Files:**
- Create: `packages/ui/src/lib/dither.ts`

**Step 1: Create `packages/ui/src/lib/dither.ts`**

```ts
export type DitherPattern = 'bayer4' | 'checker' | 'diamond' | 'hatch' | 'plus' | 'stair'

// 4×4 Bayer matrix, values 0–15
const BAYER4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5],
]

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Draw a single dither tile onto a canvas context at (x, y).
 * intensity: 0 = all loColor, 1 = all hiColor
 * tileSize: pixel size of the tile (use multiples of 4 for bayer4)
 */
export function drawDitherTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tileSize: number,
  pattern: DitherPattern,
  intensity: number,
  hiHex = '#E8E4DF',
  loHex = '#1E1C1A',
): void {
  const threshold = 1 - intensity // high intensity = low threshold = more hi pixels

  ctx.fillStyle = loHex
  ctx.fillRect(x, y, tileSize, tileSize)

  const hi = hexToRgb(hiHex)
  const lo = hexToRgb(loHex)

  for (let py = 0; py < tileSize; py++) {
    for (let px = 0; px < tileSize; px++) {
      let on = false

      if (pattern === 'bayer4') {
        const bv = BAYER4[py % 4][px % 4] / 15
        on = bv >= threshold
      } else if (pattern === 'checker') {
        on = (px + py) % 2 === 0 ? intensity > 0.25 : intensity > 0.75
      } else if (pattern === 'diamond') {
        const cx = tileSize / 2, cy = tileSize / 2
        const d = (Math.abs(px - cx) + Math.abs(py - cy)) / tileSize
        on = d < intensity * 0.7
      } else if (pattern === 'hatch') {
        on = (px + py) % 4 < Math.round(intensity * 4)
      } else if (pattern === 'plus') {
        const mx = px % 4, my = py % 4
        on = (mx === 2 || my === 2) && intensity > 0.3
      } else if (pattern === 'stair') {
        const step = Math.floor(px / (tileSize / 4))
        on = py > tileSize - (step + 1) * (tileSize / 4) * intensity
      }

      if (on) {
        ctx.fillStyle = hiHex
        ctx.fillRect(x + px, y + py, 1, 1)
      }
    }
  }
}

/**
 * Fill an entire canvas with a dither mosaic made of tileSize×tileSize blocks.
 * Each block uses the specified pattern at the given intensity.
 */
export function fillDitherMosaic(
  canvas: HTMLCanvasElement,
  pattern: DitherPattern,
  intensity: number,
  tileSize = 8,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  for (let y = 0; y < canvas.height; y += tileSize) {
    for (let x = 0; x < canvas.width; x += tileSize) {
      drawDitherTile(ctx, x, y, Math.min(tileSize, canvas.width - x), pattern, intensity)
    }
  }
}

/**
 * Map a 0–1 data value to a DitherPattern + intensity pair.
 * Used for encoding volume (market cards) and reputation (agent cards).
 */
export function dataToPattern(value: number): { pattern: DitherPattern; intensity: number } {
  const clamped = Math.max(0, Math.min(1, value))
  if (clamped < 0.2) return { pattern: 'diamond',  intensity: 0.2 + clamped }
  if (clamped < 0.5) return { pattern: 'bayer4',   intensity: 0.3 + clamped * 0.8 }
  if (clamped < 0.8) return { pattern: 'checker',  intensity: 0.4 + clamped * 0.6 }
  return                     { pattern: 'checker',  intensity: 0.9 }
}
```

**Step 2: No automated test needed for visual utilities — verify in browser once DitherPanel is built (Task 5).**

**Step 3: Commit**

```bash
git add packages/ui/src/lib/dither.ts
git commit -m "feat(ui): dither pattern library (bayer4, checker, diamond, hatch, plus, stair)"
```

---

### Task 4: MacroblockReveal Component

**Files:**
- Create: `packages/ui/src/components/dither/MacroblockReveal.tsx`

**Step 1: Create the component**

```tsx
import { useEffect, useRef } from 'react'
import { drawDitherTile, type DitherPattern } from '../../lib/dither'

const PATTERNS: DitherPattern[] = ['bayer4', 'checker', 'diamond', 'hatch']

interface Block {
  x: number
  y: number
  size: number
  pattern: DitherPattern
  intensity: number
  tearOffset: number // horizontal px offset for compression tear effect
}

interface MacroblockRevealProps {
  /** When true, triggers the reveal animation */
  active: boolean
  /** Called when animation completes */
  onDone?: () => void
  className?: string
}

export function MacroblockReveal({ active, onDone, className = '' }: MacroblockRevealProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height

    // Phase timing (ms)
    const T_SNAP    = 150  // blocks snap to grid
    const T_SUBDIV  = 350  // blocks subdivide 24→12→6
    const T_DISSOLVE = 450 // blocks dissolve

    const startTime = performance.now()

    function buildBlocks(blockSize: number): Block[] {
      const blocks: Block[] = []
      for (let y = 0; y < H; y += blockSize) {
        for (let x = 0; x < W; x += blockSize) {
          blocks.push({
            x,
            y,
            size: blockSize,
            pattern: PATTERNS[Math.floor(Math.random() * PATTERNS.length)],
            intensity: 0.2 + Math.random() * 0.7,
            tearOffset: Math.random() < 0.08 ? (Math.random() * 20 - 10) : 0,
          })
        }
      }
      return blocks
    }

    function drawBlocks(blocks: Block[], alpha: number, tearProgress: number) {
      ctx.clearRect(0, 0, W, H)
      ctx.globalAlpha = alpha
      for (const b of blocks) {
        const tx = b.x + b.tearOffset * tearProgress
        ctx.save()
        ctx.beginPath()
        ctx.rect(tx, b.y, b.size, b.size)
        ctx.clip()
        drawDitherTile(ctx, tx, b.y, b.size, b.pattern, b.intensity)
        ctx.restore()
      }
      ctx.globalAlpha = 1
    }

    let blocks24 = buildBlocks(24)
    let blocks12: Block[] | null = null
    let blocks6: Block[] | null = null

    function frame(now: number) {
      const elapsed = now - startTime

      if (elapsed < T_SNAP) {
        // Phase 1: solid macroblocks, no tear yet
        drawBlocks(blocks24, 1, 0)
      } else if (elapsed < T_SUBDIV) {
        // Phase 2: subdivide to 12, then 6
        const progress = (elapsed - T_SNAP) / (T_SUBDIV - T_SNAP)
        if (progress > 0.5 && !blocks12) blocks12 = buildBlocks(12)
        if (progress > 0.85 && !blocks6) blocks6 = buildBlocks(6)
        const current = blocks6 ?? blocks12 ?? blocks24
        drawBlocks(current, 1, Math.min(progress * 2, 1))
      } else if (elapsed < T_DISSOLVE) {
        // Phase 3: dissolve with tear
        const progress = (elapsed - T_SUBDIV) / (T_DISSOLVE - T_SUBDIV)
        const alpha = 1 - progress
        const current = blocks6 ?? blocks12 ?? blocks24
        drawBlocks(current, alpha, 1)
      } else {
        ctx.clearRect(0, 0, W, H)
        cancelAnimationFrame(rafRef.current)
        onDone?.()
        return
      }

      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafRef.current)
  }, [active, onDone])

  return (
    <canvas
      ref={canvasRef}
      width={typeof window !== 'undefined' ? window.innerWidth : 1440}
      height={typeof window !== 'undefined' ? window.innerHeight : 900}
      className={`pointer-events-none absolute inset-0 z-50 ${className}`}
      style={{ display: active ? 'block' : 'none' }}
    />
  )
}
```

**Step 2: Commit**

```bash
git add packages/ui/src/components/dither/MacroblockReveal.tsx
git commit -m "feat(ui): MacroblockReveal canvas transition (macroblock subdivide + tear)"
```

---

### Task 5: DitherPanel Component

**Files:**
- Create: `packages/ui/src/components/dither/DitherPanel.tsx`

**Step 1: Create the component**

```tsx
import { useEffect, useRef } from 'react'
import { dataToPattern, fillDitherMosaic, type DitherPattern } from '../../lib/dither'

interface DitherPanelProps {
  /** 0–1 data value — maps to pattern + intensity automatically */
  value?: number
  /** Override pattern directly (skips value mapping) */
  pattern?: DitherPattern
  /** Override intensity directly (skips value mapping) */
  intensity?: number
  /** Tile size in pixels */
  tileSize?: number
  width?: number | string
  height?: number | string
  className?: string
}

export function DitherPanel({
  value,
  pattern: patternProp,
  intensity: intensityProp,
  tileSize = 6,
  width = '100%',
  height = '100%',
  className = '',
}: DitherPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const observer = new ResizeObserver(() => {
      canvas.width = container.offsetWidth
      canvas.height = container.offsetHeight
      render()
    })
    observer.observe(container)

    function render() {
      let p = patternProp
      let i = intensityProp ?? 0.5
      if (value !== undefined) {
        const mapped = dataToPattern(value)
        p = patternProp ?? mapped.pattern
        i = intensityProp ?? mapped.intensity
      }
      fillDitherMosaic(canvas!, p ?? 'bayer4', i, tileSize)
    }

    render()
    return () => observer.disconnect()
  }, [value, patternProp, intensityProp, tileSize])

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={{ width, height }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  )
}
```

**Step 2: Verify visually — temporarily render `<DitherPanel value={0.5} width={200} height={120} />` in `App.tsx`, run `pnpm dev`, confirm dither pattern appears.**

**Step 3: Commit**

```bash
git add packages/ui/src/components/dither/DitherPanel.tsx
git commit -m "feat(ui): DitherPanel canvas component with ResizeObserver"
```

---

### Task 6: API Client Layer

**Files:**
- Create: `packages/ui/src/api/client.ts`
- Create: `packages/ui/src/api/types.ts`
- Create: `packages/ui/src/api/markets.ts`
- Create: `packages/ui/src/api/agents.ts`
- Create: `packages/ui/src/api/reputation.ts`
- Create: `packages/ui/src/api/autonomy.ts`

**Step 1: Create `packages/ui/src/api/client.ts`**

```ts
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new ApiError(res.status, body.error ?? res.statusText)
  }
  return res.json() as Promise<T>
}
```

**Step 2: Create `packages/ui/src/api/types.ts`**

Copy the relevant types from the backend packages as plain TS interfaces (no imports from backend):

```ts
// Mirror of packages/markets/src/types.ts
export type MarketStatus = 'OPEN' | 'CLOSED' | 'RESOLVED' | 'DISPUTED'

export interface Market {
  id: string
  question: string
  description?: string
  creatorAccountId: string
  escrowAccountId: string
  topicId: string
  topicUrl: string
  closeTime: string
  createdAt: string
  status: MarketStatus
  outcomes: string[]
  outcomeTokenIds: Record<string, string>
  outcomeTokenUrls: Record<string, string>
  resolvedOutcome?: string
  resolvedAt?: string
  resolvedByAccountId?: string
}

export interface MarketBet {
  id: string
  marketId: string
  bettorAccountId: string
  outcome: string
  amountHbar: number
  placedAt: string
  escrowTransactionId?: string
  escrowTransactionUrl?: string
  topicTransactionId?: string
  topicSequenceNumber?: number
}

export interface MarketOrder {
  id: string
  marketId: string
  accountId: string
  outcome: string
  side: 'BID' | 'ASK'
  quantity: number
  price: number
  createdAt: string
  status: 'OPEN' | 'CANCELLED'
  topicTransactionId?: string
  topicTransactionUrl?: string
}

export interface OrderBookSnapshot {
  marketId: string
  orders: MarketOrder[]
  bids: MarketOrder[]
  asks: MarketOrder[]
}

// Mirror of packages/agents/src/agent.ts (as returned by API)
export interface Agent {
  id: string
  name: string
  accountId: string
  bankrollHbar: number
  reputationScore: number
  strategy: string
}

// Mirror of packages/reputation/src/types.ts
export interface ReputationLeaderboardEntry {
  accountId: string
  score: number
  attestationCount: number
}

export interface TrustEdge {
  from: string
  to: string
  weight: number
  attestations: number
}

export interface TrustGraph {
  nodes: string[]
  edges: TrustEdge[]
  adjacency: Record<string, TrustEdge[]>
}

// Autonomy engine status
export interface AutonomyStatus {
  enabled: boolean
  running: boolean
  tickCount?: number
  agentCount?: number
  reason?: string
}

// WebSocket event shape
export interface WsEvent<T = unknown> {
  type: string
  payload: T
  timestamp: string
}
```

**Step 3: Create `packages/ui/src/api/markets.ts`**

```ts
import { apiFetch } from './client'
import type { Market, OrderBookSnapshot } from './types'

export const marketsApi = {
  list: () => apiFetch<{ markets: Market[] }>('/markets').then(r => r.markets),
  get:  (id: string) => apiFetch<{ market: Market }>(`/markets/${id}`).then(r => r.market),
  orderBook: (id: string) => apiFetch<OrderBookSnapshot>(`/markets/${id}/orderbook`),
}
```

**Step 4: Create `packages/ui/src/api/agents.ts`**

```ts
import { apiFetch } from './client'
import type { Agent } from './types'

export const agentsApi = {
  list: () => apiFetch<{ agents: Agent[] }>('/agents').then(r => r.agents),
}
```

**Step 5: Create `packages/ui/src/api/reputation.ts`**

```ts
import { apiFetch } from './client'
import type { ReputationLeaderboardEntry, TrustGraph } from './types'

export const reputationApi = {
  leaderboard: () =>
    apiFetch<{ leaderboard: ReputationLeaderboardEntry[] }>('/reputation/leaderboard').then(r => r.leaderboard),
  trustGraph: () =>
    apiFetch<{ graph: TrustGraph }>('/reputation/trust-graph').then(r => r.graph),
}
```

**Step 6: Create `packages/ui/src/api/autonomy.ts`**

```ts
import { apiFetch } from './client'
import type { AutonomyStatus } from './types'

export const autonomyApi = {
  status:  () => apiFetch<AutonomyStatus>('/autonomy/status'),
  start:   () => apiFetch<AutonomyStatus>('/autonomy/status', { method: 'POST' }),
  stop:    () => apiFetch<AutonomyStatus>('/autonomy/stop',   { method: 'POST' }),
  runNow:  () => apiFetch<AutonomyStatus>('/autonomy/run-now', { method: 'POST' }),
}
```

**Step 7: Commit**

```bash
git add packages/ui/src/api/
git commit -m "feat(ui): API client layer with typed wrappers for all endpoints"
```

---

### Task 7: App.tsx + Routing + QueryClient

**Files:**
- Modify: `packages/ui/src/App.tsx`

**Step 1: Replace `App.tsx`**

```tsx
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
```

**Step 2: Create stub pages so App.tsx compiles**

Create `packages/ui/src/pages/Dashboard.tsx`:
```tsx
export function Dashboard() { return <div className="p-8 editorial text-primary">Dashboard</div> }
```

Create `packages/ui/src/pages/Markets.tsx`:
```tsx
export function Markets() { return <div className="p-8 editorial text-primary">Markets</div> }
```

Create `packages/ui/src/pages/Agents.tsx`:
```tsx
export function Agents() { return <div className="p-8 editorial text-primary">Agents</div> }
```

**Step 3: Commit**

```bash
git add packages/ui/src/App.tsx packages/ui/src/pages/
git commit -m "feat(ui): App router, QueryClient setup, stub pages"
```

---

### Task 8: WebSocket Hook

**Files:**
- Create: `packages/ui/src/hooks/useWebSocket.tsx`

**Step 1: Create the hook and context**

```tsx
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
```

**Step 2: Verify compilation — `pnpm dev` should show no TypeScript errors.**

**Step 3: Commit**

```bash
git add packages/ui/src/hooks/useWebSocket.tsx
git commit -m "feat(ui): WebSocket provider with TanStack Query cache invalidation"
```

---

### Task 9: TanStack Query Hooks

**Files:**
- Create: `packages/ui/src/hooks/useMarkets.ts`
- Create: `packages/ui/src/hooks/useAgents.ts`
- Create: `packages/ui/src/hooks/useReputation.ts`

**Step 1: Create `packages/ui/src/hooks/useMarkets.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { marketsApi } from '../api/markets'

export function useMarkets() {
  return useQuery({ queryKey: ['markets'], queryFn: marketsApi.list })
}

export function useMarket(id: string) {
  return useQuery({
    queryKey: ['markets', id],
    queryFn: () => marketsApi.get(id),
    enabled: Boolean(id),
  })
}

export function useOrderBook(id: string) {
  return useQuery({
    queryKey: ['orderbook', id],
    queryFn: () => marketsApi.orderBook(id),
    enabled: Boolean(id),
    refetchInterval: 15_000,
  })
}
```

**Step 2: Create `packages/ui/src/hooks/useAgents.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { agentsApi } from '../api/agents'

export function useAgents() {
  return useQuery({ queryKey: ['agents'], queryFn: agentsApi.list })
}
```

**Step 3: Create `packages/ui/src/hooks/useReputation.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { reputationApi } from '../api/reputation'

export function useLeaderboard() {
  return useQuery({ queryKey: ['reputation', 'leaderboard'], queryFn: reputationApi.leaderboard })
}

export function useTrustGraph() {
  return useQuery({ queryKey: ['reputation', 'trust-graph'], queryFn: reputationApi.trustGraph })
}
```

**Step 4: Commit**

```bash
git add packages/ui/src/hooks/useMarkets.ts packages/ui/src/hooks/useAgents.ts packages/ui/src/hooks/useReputation.ts
git commit -m "feat(ui): TanStack Query hooks for markets, agents, reputation"
```

---

### Task 10: Layout — Shell, Nav, PageHeader

**Files:**
- Create: `packages/ui/src/components/layout/Shell.tsx`
- Create: `packages/ui/src/components/layout/Nav.tsx`
- Create: `packages/ui/src/components/layout/PageHeader.tsx`

**Step 1: Create `packages/ui/src/components/layout/Nav.tsx`**

```tsx
import { NavLink } from 'react-router-dom'
import { useWebSocket } from '../../hooks/useWebSocket'
import { DitherPanel } from '../dither/DitherPanel'

const links = [
  { to: '/',        label: 'Dashboard' },
  { to: '/markets', label: 'Markets'   },
  { to: '/agents',  label: 'Agents'    },
]

export function Nav() {
  const { status } = useWebSocket()

  return (
    <nav
      className="fixed left-0 top-0 h-screen flex flex-col border-r border-hair"
      style={{ width: 220, background: 'var(--bg-surface)' }}
    >
      {/* Wordmark */}
      <div className="flex items-center justify-between px-5 py-6">
        <span
          className="label"
          style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--text-primary)' }}
        >
          SIMULACRUM
        </span>
        {/* WS status dot */}
        <span
          title={status}
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: status === 'connected' ? 'var(--accent)' : 'var(--text-dim)',
            flexShrink: 0,
          }}
        />
      </div>

      {/* Dither strip */}
      <DitherPanel pattern="bayer4" intensity={0.18} height={4} className="w-full" />

      {/* Nav links */}
      <div className="flex flex-col gap-1 px-3 mt-4 flex-1">
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center px-3 py-2 rounded-[8px] text-sm transition-colors ${
                isActive
                  ? 'bg-raised text-primary border-l-2'
                  : 'text-muted hover:text-primary hover:bg-raised'
              }`
            }
            style={({ isActive }) => isActive ? { borderColor: 'var(--accent)' } : {}}
          >
            {label}
          </NavLink>
        ))}
      </div>

      {/* Bottom dither strip */}
      <DitherPanel pattern="hatch" intensity={0.12} height={3} className="w-full" />
    </nav>
  )
}
```

**Step 2: Create `packages/ui/src/components/layout/Shell.tsx`**

```tsx
import { Outlet } from 'react-router-dom'
import { Nav } from './Nav'

export function Shell() {
  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg-base)' }}>
      <Nav />
      <main className="flex-1" style={{ marginLeft: 220 }}>
        <Outlet />
      </main>
    </div>
  )
}
```

**Step 3: Create `packages/ui/src/components/layout/PageHeader.tsx`**

```tsx
import { DitherPanel } from '../dither/DitherPanel'

interface PageHeaderProps {
  title: string
  meta?: string
}

export function PageHeader({ title, meta }: PageHeaderProps) {
  return (
    <header style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="px-8 pt-10 pb-6">
        {meta && <p className="label mb-2">{meta}</p>}
        <h1 className="editorial text-primary">{title}</h1>
      </div>
      <DitherPanel pattern="bayer4" intensity={0.22} height={3} className="w-full" />
    </header>
  )
}
```

**Step 4: Verify shell renders with nav and outlet**

`pnpm dev` → navigate between routes, confirm nav highlights active link, WS dot shows.

**Step 5: Commit**

```bash
git add packages/ui/src/components/layout/
git commit -m "feat(ui): Shell, Nav with WS dot, PageHeader with dither band"
```

---

### Task 11: Shared Components — HashScanLink, OddsBar, Sparkline

**Files:**
- Create: `packages/ui/src/components/HashScanLink.tsx`
- Create: `packages/ui/src/components/OddsBar.tsx`
- Create: `packages/ui/src/components/Sparkline.tsx`

**Step 1: Create `packages/ui/src/components/HashScanLink.tsx`**

```tsx
import { useState } from 'react'

interface HashScanLinkProps {
  id: string
  url: string
  label?: string
}

export function HashScanLink({ id, url, label }: HashScanLinkProps) {
  const [copied, setCopied] = useState(false)

  function copy() {
    void navigator.clipboard.writeText(id)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const display = label ?? id.length > 20 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id

  return (
    <span className="inline-flex items-center gap-2">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-xs hover:underline"
        style={{ color: 'var(--accent)' }}
        title={id}
      >
        {display}
      </a>
      <button
        onClick={copy}
        className="label"
        style={{ fontSize: 10, cursor: 'pointer', color: copied ? 'var(--accent)' : 'var(--text-dim)', background: 'none', border: 'none' }}
      >
        {copied ? 'COPIED' : 'COPY'}
      </button>
    </span>
  )
}
```

**Step 2: Create `packages/ui/src/components/OddsBar.tsx`**

The dither-stepped fill edge is achieved by stacking the canvas DitherPanel at the exact fill boundary.

```tsx
import { DitherPanel } from './dither/DitherPanel'

interface OddsBarProps {
  outcomes: string[]
  /** outcome -> bet count or volume; used to compute fill % */
  counts: Record<string, number>
  height?: number
}

export function OddsBar({ outcomes, counts, height = 8 }: OddsBarProps) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1
  const primary = outcomes[0] ?? 'YES'
  const fillPct = ((counts[primary] ?? 0) / total) * 100

  return (
    <div
      className="relative w-full overflow-hidden rounded-sm"
      style={{ height, background: 'var(--bg-raised)' }}
    >
      {/* Filled region */}
      <div
        className="absolute left-0 top-0 h-full transition-[width] duration-500"
        style={{ width: `${fillPct}%`, background: 'var(--accent-dim)' }}
      />
      {/* Dither edge — 12px strip right at the fill boundary */}
      <div
        className="absolute top-0 h-full"
        style={{ width: 12, left: `calc(${fillPct}% - 6px)` }}
      >
        <DitherPanel pattern="bayer4" intensity={0.55} width="100%" height="100%" />
      </div>
    </div>
  )
}
```

**Step 3: Create `packages/ui/src/components/Sparkline.tsx`**

```tsx
interface SparklineProps {
  values: number[]
  width?: number
  height?: number
  className?: string
}

export function Sparkline({ values, width = 120, height = 32, className = '' }: SparklineProps) {
  if (values.length < 2) return null

  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width
    const y = height - ((v - min) / range) * height * 0.85 - height * 0.075
    return `${x},${y}`
  })

  const pathD = `M ${points.join(' L ')}`

  // Fade: clip the last 25% to a dither pattern via SVG mask
  const fadeStart = width * 0.75

  return (
    <svg
      width={width}
      height={height}
      className={className}
      viewBox={`0 0 ${width} ${height}`}
    >
      <defs>
        <linearGradient id="sparklFade" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset={`${(fadeStart / width) * 100}%`} stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id="sparklMask">
          <rect width={width} height={height} fill="url(#sparklFade)" />
        </mask>
      </defs>
      <path
        d={pathD}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        mask="url(#sparklMask)"
      />
      {/* Stair dither at tail */}
      <rect
        x={fadeStart}
        width={width - fadeStart}
        height={height}
        fill="none"
        opacity={0.3}
      />
    </svg>
  )
}
```

**Step 4: Commit**

```bash
git add packages/ui/src/components/HashScanLink.tsx packages/ui/src/components/OddsBar.tsx packages/ui/src/components/Sparkline.tsx
git commit -m "feat(ui): HashScanLink, OddsBar (dither edge), Sparkline (fade tail)"
```

---

### Task 12: ActivityFeed Component

**Files:**
- Create: `packages/ui/src/components/ActivityFeed.tsx`

**Step 1: Create `packages/ui/src/components/ActivityFeed.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import type { WsEvent } from '../api/types'
import { useWebSocket } from '../hooks/useWebSocket'

const MAX_EVENTS = 200

function eventLabel(type: string): string {
  return type.replace('.', ' ').toUpperCase()
}

function eventSummary(event: WsEvent): string {
  const p = event.payload as Record<string, unknown>
  if (typeof p.question === 'string') return p.question
  if (typeof p.marketId === 'string') return `Market ${String(p.marketId).slice(0, 8)}`
  if (typeof p.name === 'string') return p.name as string
  return event.type
}

interface ActivityFeedProps {
  onEventClick?: (event: WsEvent) => void
  className?: string
}

export function ActivityFeed({ onEventClick, className = '' }: ActivityFeedProps) {
  const [events, setEvents] = useState<WsEvent[]>([])
  const { subscribe } = useWebSocket()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return subscribe((event) => {
      setEvents((prev) => {
        const next = [event, ...prev]
        return next.slice(0, MAX_EVENTS)
      })
    })
  }, [subscribe])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  if (events.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-16 ${className}`}>
        <p className="label">Waiting for events…</p>
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-0 overflow-y-auto ${className}`}>
      {events.map((event, i) => (
        <button
          key={i}
          onClick={() => onEventClick?.(event)}
          className="flex items-center gap-3 px-4 py-2.5 text-left hover:bg-raised border-b transition-colors"
          style={{ borderColor: 'var(--border)', background: 'transparent', cursor: 'pointer' }}
        >
          <span className="font-mono text-xs shrink-0" style={{ color: 'var(--text-dim)', minWidth: 70 }}>
            {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <span
            className="label shrink-0"
            style={{ fontSize: 10, color: 'var(--accent)', borderColor: 'var(--accent-dim)', border: '1px solid', padding: '1px 6px', borderRadius: 3 }}
          >
            {eventLabel(event.type)}
          </span>
          <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
            {eventSummary(event)}
          </span>
        </button>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add packages/ui/src/components/ActivityFeed.tsx
git commit -m "feat(ui): ActivityFeed real-time WS event stream"
```

---

### Task 13: Drawer Component

**Files:**
- Create: `packages/ui/src/components/Drawer.tsx`

**Step 1: Create `packages/ui/src/components/Drawer.tsx`**

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MacroblockReveal } from './dither/MacroblockReveal'

interface DrawerProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  width?: number
}

export function Drawer({ open, onClose, children, width = 480 }: DrawerProps) {
  const [revealing, setRevealing] = useState(false)
  const [contentVisible, setContentVisible] = useState(false)
  const prevOpen = useRef(false)

  useEffect(() => {
    if (open && !prevOpen.current) {
      setRevealing(true)
      setContentVisible(false)
    }
    if (!open) {
      setContentVisible(false)
    }
    prevOpen.current = open
  }, [open])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  if (!open && !revealing) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className="fixed right-0 top-0 h-screen z-50 flex flex-col border-l"
        style={{
          width,
          background: 'var(--bg-surface)',
          borderColor: 'var(--border)',
          transform: open ? 'translateX(0)' : `translateX(${width}px)`,
          transition: 'transform 0.25s linear',
        }}
      >
        {/* Macroblock reveal canvas — covers the drawer on open */}
        <MacroblockReveal
          active={revealing}
          onDone={() => {
            setRevealing(false)
            setContentVisible(true)
          }}
        />

        {/* Content — visible after reveal completes */}
        <div
          className="flex flex-col h-full overflow-y-auto"
          style={{ opacity: contentVisible ? 1 : 0, transition: 'opacity 0.1s linear' }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 label"
            style={{ fontSize: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}
          >
            ESC
          </button>
          {children}
        </div>
      </div>
    </>
  )
}
```

**Step 2: Commit**

```bash
git add packages/ui/src/components/Drawer.tsx
git commit -m "feat(ui): Drawer with MacroblockReveal on open + Escape to close"
```

---

### Task 14: MarketCard Component

**Files:**
- Create: `packages/ui/src/components/MarketCard.tsx`

**Step 1: Create the component**

```tsx
import type { Market } from '../api/types'
import { DitherPanel } from './dither/DitherPanel'
import { OddsBar } from './OddsBar'

interface MarketCardProps {
  market: Market
  /** 0–1 normalized volume for dither encoding */
  volumeNorm: number
  onClick?: () => void
  horizontal?: boolean
}

export function MarketCard({ market, volumeNorm, onClick, horizontal = false }: MarketCardProps) {
  const closesAt = new Date(market.closeTime)
  const isExpired = closesAt < new Date()
  const fakeCount = market.outcomes.reduce<Record<string, number>>((acc, o, i) => {
    acc[o] = i === 0 ? 60 : 40 // placeholder split; replace with real bet counts when available
    return acc
  }, {})

  if (horizontal) {
    return (
      <button
        onClick={onClick}
        className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-raised border-b transition-colors"
        style={{ borderColor: 'var(--border)', background: 'transparent', cursor: 'pointer' }}
      >
        <span className="flex-1 text-sm font-medium text-primary truncate">{market.question}</span>
        <span className="status-badge shrink-0" data-status={market.status}>{market.status}</span>
        <div className="w-24 shrink-0">
          <OddsBar outcomes={market.outcomes} counts={fakeCount} height={6} />
        </div>
        <span className="font-mono text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
          {market.creatorAccountId.slice(0, 10)}…
        </span>
        <span className="label shrink-0" style={{ fontSize: 10 }}>
          {isExpired ? 'CLOSED' : closesAt.toLocaleDateString()}
        </span>
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      className="flex overflow-hidden text-left transition-colors"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        cursor: 'pointer',
        width: '100%',
      }}
    >
      {/* Main content */}
      <div className="flex flex-col gap-3 p-4 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-primary leading-snug">{market.question}</p>
          <span className="status-badge shrink-0" data-status={market.status}>{market.status}</span>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            {market.outcomes.map(o => (
              <span key={o} className="label" style={{ fontSize: 10 }}>{o}</span>
            ))}
          </div>
          <OddsBar outcomes={market.outcomes} counts={fakeCount} height={8} />
        </div>

        <div className="flex items-center justify-between">
          <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
            {market.creatorAccountId}
          </span>
          <span className="label" style={{ fontSize: 10 }}>
            {isExpired ? 'expired' : `closes ${closesAt.toLocaleDateString()}`}
          </span>
        </div>
      </div>

      {/* Dither strip — right edge, encodes volume */}
      <div className="shrink-0 scanline-zone" style={{ width: 100 }}>
        <DitherPanel value={volumeNorm} width={100} height="100%" />
      </div>
    </button>
  )
}
```

**Step 2: Commit**

```bash
git add packages/ui/src/components/MarketCard.tsx
git commit -m "feat(ui): MarketCard with dither volume strip and horizontal mode"
```

---

### Task 15: AgentCard Component

**Files:**
- Create: `packages/ui/src/components/AgentCard.tsx`

**Step 1: Create `packages/ui/src/components/AgentCard.tsx`**

```tsx
import type { Agent } from '../api/types'
import { DitherPanel } from './dither/DitherPanel'

interface AgentCardProps {
  agent: Agent
  rank?: number
  onClick?: () => void
}

export function AgentCard({ agent, rank, onClick }: AgentCardProps) {
  const repNorm = agent.reputationScore / 100

  return (
    <button
      onClick={onClick}
      className="relative overflow-hidden text-left transition-colors"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        cursor: 'pointer',
        width: '100%',
      }}
    >
      {/* Corner dither patch — top-right, encodes rep */}
      <div
        className="absolute top-0 right-0"
        style={{ width: 60, height: 60 }}
      >
        <DitherPanel value={repNorm} width={60} height={60} />
      </div>

      <div className="flex flex-col gap-2 p-4">
        {/* Name row */}
        <div className="flex items-center gap-2 pr-14">
          {rank !== undefined && (
            <span className="label" style={{ fontSize: 10, color: 'var(--accent)' }}>
              #{rank}
            </span>
          )}
          <span className="text-sm font-medium text-primary truncate">{agent.name}</span>
        </div>

        {/* Account ID */}
        <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
          {agent.accountId}
        </span>

        {/* Strategy badge */}
        <span
          className="label"
          style={{
            fontSize: 10,
            background: 'var(--bg-raised)',
            border: '1px solid var(--border)',
            padding: '2px 6px',
            borderRadius: 4,
            display: 'inline-block',
            width: 'fit-content',
          }}
        >
          {agent.strategy}
        </span>

        {/* Rep bar */}
        <div className="flex flex-col gap-1 mt-1">
          <div className="flex items-center justify-between">
            <span className="label" style={{ fontSize: 10 }}>REP</span>
            <span className="font-mono text-xs" style={{ color: 'var(--accent)' }}>
              {agent.reputationScore}
            </span>
          </div>
          <div className="w-full rounded-sm overflow-hidden" style={{ height: 4, background: 'var(--bg-raised)' }}>
            <div
              className="h-full transition-[width]"
              style={{ width: `${agent.reputationScore}%`, background: 'var(--accent-dim)' }}
            />
          </div>
        </div>

        {/* Bankroll */}
        <div className="flex items-center justify-between mt-1">
          <span className="label" style={{ fontSize: 10 }}>BANKROLL</span>
          <span className="font-mono text-xs text-primary">{agent.bankrollHbar.toFixed(2)} ℏ</span>
        </div>
      </div>
    </button>
  )
}
```

**Step 2: Commit**

```bash
git add packages/ui/src/components/AgentCard.tsx
git commit -m "feat(ui): AgentCard with rep-encoded corner dither patch"
```

---

### Task 16: Dashboard Page

**Files:**
- Modify: `packages/ui/src/pages/Dashboard.tsx`

**Step 1: Replace `Dashboard.tsx`**

```tsx
import { useState } from 'react'
import type { WsEvent } from '../api/types'
import { ActivityFeed } from '../components/ActivityFeed'
import { Drawer } from '../components/Drawer'
import { DitherPanel } from '../components/dither/DitherPanel'
import { MarketCard } from '../components/MarketCard'
import { MarketDetail } from './MarketDetail'
import { useMarkets } from '../hooks/useMarkets'

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="relative flex flex-col gap-1 p-4 overflow-hidden"
      style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--bg-surface)' }}
    >
      <DitherPanel pattern="hatch" intensity={0.08} className="absolute inset-0" />
      <span className="label relative z-10">{label}</span>
      <span className="relative z-10 text-2xl font-light text-primary" style={{ letterSpacing: -1 }}>{value}</span>
    </div>
  )
}

export function Dashboard() {
  const { data: markets = [], isLoading } = useMarkets()
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null)

  const open = markets.filter(m => m.status === 'OPEN')
  const resolved = markets.filter(m => m.status === 'RESOLVED')
  const maxVolume = 1 // placeholder; replace with real volume when bets endpoint exposes totals

  function handleEventClick(event: WsEvent) {
    const p = event.payload as Record<string, unknown>
    if (typeof p.marketId === 'string') setSelectedMarketId(p.marketId)
    else if (typeof p.id === 'string' && event.type.startsWith('market')) setSelectedMarketId(p.id)
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Stats band */}
      <div
        className="grid gap-4 px-8 py-6"
        style={{ gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid var(--border)' }}
      >
        <StatTile label="Open Markets" value={open.length} />
        <StatTile label="Total Markets" value={markets.length} />
        <StatTile label="Resolved" value={resolved.length} />
        <StatTile label="Network" value="Hedera Testnet" />
      </div>

      {/* Main body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Markets grid (60%) */}
        <section className="flex-1 overflow-y-auto px-8 py-6" style={{ borderRight: '1px solid var(--border)' }}>
          <p className="label mb-4">Active Markets</p>
          {isLoading && (
            <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  style={{ height: 140, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)' }}
                >
                  <DitherPanel pattern="bayer4" intensity={0.15} width="100%" height="100%" />
                </div>
              ))}
            </div>
          )}
          {!isLoading && markets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <DitherPanel pattern="plus" intensity={0.3} width={120} height={80} className="mb-4" />
              <p className="label">No markets yet</p>
            </div>
          )}
          <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {open.map(market => (
              <MarketCard
                key={market.id}
                market={market}
                volumeNorm={maxVolume}
                onClick={() => setSelectedMarketId(market.id)}
              />
            ))}
          </div>
        </section>

        {/* Activity feed (40%) */}
        <aside style={{ width: 360, flexShrink: 0 }}>
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="label">Live Activity</p>
          </div>
          <ActivityFeed onEventClick={handleEventClick} className="flex-1 overflow-y-auto" />
        </aside>
      </div>

      {/* Market detail drawer */}
      <Drawer open={Boolean(selectedMarketId)} onClose={() => setSelectedMarketId(null)}>
        {selectedMarketId && <MarketDetail marketId={selectedMarketId} />}
      </Drawer>
    </div>
  )
}
```

**Step 2: Verify in browser — `pnpm dev`, navigate to `/`, confirm stat tiles, market grid skeleton loads, activity feed column renders.**

**Step 3: Commit**

```bash
git add packages/ui/src/pages/Dashboard.tsx
git commit -m "feat(ui): Dashboard page with stats, market grid, activity feed, drawer"
```

---

### Task 17: Markets Page

**Files:**
- Modify: `packages/ui/src/pages/Markets.tsx`

**Step 1: Replace `Markets.tsx`**

```tsx
import { useState } from 'react'
import type { MarketStatus } from '../api/types'
import { Drawer } from '../components/Drawer'
import { PageHeader } from '../components/layout/PageHeader'
import { MarketCard } from '../components/MarketCard'
import { useMarkets } from '../hooks/useMarkets'
import { MarketDetail } from './MarketDetail'

const STATUS_FILTERS: Array<MarketStatus | 'ALL'> = ['ALL', 'OPEN', 'RESOLVED', 'CLOSED', 'DISPUTED']

export function Markets() {
  const { data: markets = [], isLoading } = useMarkets()
  const [filter, setFilter] = useState<MarketStatus | 'ALL'>('ALL')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filtered = filter === 'ALL' ? markets : markets.filter(m => m.status === filter)

  return (
    <div className="flex flex-col min-h-screen">
      <PageHeader title="Markets" meta={`${markets.length} total`} />

      {/* Filter bar */}
      <div
        className="flex items-center gap-2 px-8 py-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className="label transition-colors"
            style={{
              fontSize: 11,
              padding: '3px 10px',
              borderRadius: 4,
              border: '1px solid',
              cursor: 'pointer',
              background: filter === s ? 'var(--accent-dim)' : 'transparent',
              borderColor: filter === s ? 'var(--accent)' : 'var(--border)',
              color: filter === s ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            {s}
          </button>
        ))}
        <span className="ml-auto label">{filtered.length} shown</span>
      </div>

      {/* Table-style list */}
      <div className="flex flex-col flex-1">
        {/* Column headers */}
        <div
          className="grid px-4 py-2"
          style={{
            gridTemplateColumns: '1fr 100px 120px 140px 100px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {['Question', 'Status', 'Odds', 'Creator', 'Closes'].map(h => (
            <span key={h} className="label" style={{ fontSize: 10 }}>{h}</span>
          ))}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <span className="label">Loading…</span>
          </div>
        )}

        {filtered.map(market => (
          <MarketCard
            key={market.id}
            market={market}
            volumeNorm={0.5}
            horizontal
            onClick={() => setSelectedId(market.id)}
          />
        ))}

        {!isLoading && filtered.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <span className="label">No markets match filter</span>
          </div>
        )}
      </div>

      <Drawer open={Boolean(selectedId)} onClose={() => setSelectedId(null)}>
        {selectedId && <MarketDetail marketId={selectedId} />}
      </Drawer>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add packages/ui/src/pages/Markets.tsx
git commit -m "feat(ui): Markets page with status filter bar and horizontal card list"
```

---

### Task 18: MarketDetail Drawer Content

**Files:**
- Create: `packages/ui/src/pages/MarketDetail.tsx`

**Step 1: Create `packages/ui/src/pages/MarketDetail.tsx`**

```tsx
import { DitherPanel } from '../components/dither/DitherPanel'
import { HashScanLink } from '../components/HashScanLink'
import { OddsBar } from '../components/OddsBar'
import { Sparkline } from '../components/Sparkline'
import { useMarket, useOrderBook } from '../hooks/useMarkets'

interface MarketDetailProps {
  marketId: string
}

export function MarketDetail({ marketId }: MarketDetailProps) {
  const { data: market, isLoading } = useMarket(marketId)
  const { data: orderBook } = useOrderBook(marketId)

  if (isLoading || !market) {
    return (
      <div className="h-full">
        <DitherPanel pattern="bayer4" intensity={0.2} width="100%" height="100%" />
      </div>
    )
  }

  const fakeCount = market.outcomes.reduce<Record<string, number>>((acc, o, i) => {
    acc[o] = i === 0 ? 60 : 40
    return acc
  }, {})

  const fakeSparkline = Array.from({ length: 20 }, (_, i) => Math.sin(i * 0.4) * 30 + 50)

  return (
    <div className="flex flex-col h-full">
      {/* Header band — scanline zone */}
      <div
        className="scanline-zone relative px-6 py-6 shrink-0"
        style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border)', minHeight: 120 }}
      >
        <DitherPanel
          pattern="bayer4"
          intensity={0.08}
          className="absolute inset-0"
        />
        <div className="relative z-10">
          <span className="status-badge mb-3 inline-block" data-status={market.status}>{market.status}</span>
          <h2 className="text-primary font-light leading-snug" style={{ fontSize: 20 }}>{market.question}</h2>
          {market.description && (
            <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>{market.description}</p>
          )}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Odds */}
        <section className="px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="label mb-3">Odds</p>
          <div className="flex items-center justify-between mb-2">
            {market.outcomes.map(o => (
              <div key={o} className="flex flex-col items-center gap-1">
                <span className="text-3xl font-light text-primary">{o === market.outcomes[0] ? '60' : '40'}<span className="text-base text-muted">%</span></span>
                <span className="label" style={{ fontSize: 10 }}>{o}</span>
              </div>
            ))}
          </div>
          <OddsBar outcomes={market.outcomes} counts={fakeCount} height={10} />
        </section>

        {/* Sparkline */}
        <section className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="label mb-3">Volume</p>
          <Sparkline values={fakeSparkline} width={400} height={48} />
        </section>

        {/* Orderbook */}
        {orderBook && (
          <section className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="label mb-3">Order Book</p>
            <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <p className="label mb-2" style={{ fontSize: 10, color: 'var(--accent)' }}>BIDS</p>
                {orderBook.bids.slice(0, 8).map(o => (
                  <div key={o.id} className="flex justify-between py-1" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="font-mono text-xs text-primary">{o.quantity}</span>
                    <span className="font-mono text-xs" style={{ color: 'var(--accent)' }}>{o.price}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="label mb-2" style={{ fontSize: 10, color: 'var(--text-muted)' }}>ASKS</p>
                {orderBook.asks.slice(0, 8).map(o => (
                  <div key={o.id} className="flex justify-between py-1" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="font-mono text-xs text-primary">{o.quantity}</span>
                    <span className="font-mono text-xs text-muted">{o.price}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* On-chain metadata */}
        <section
          className="relative px-6 py-5 scanline-zone"
          style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border)' }}
        >
          <DitherPanel pattern="bayer4" intensity={0.06} className="absolute inset-0" />
          <div className="relative z-10">
            <p className="label mb-3">On-Chain</p>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="label" style={{ fontSize: 10 }}>Topic ID</span>
                <HashScanLink id={market.topicId} url={market.topicUrl} />
              </div>
              {Object.entries(market.outcomeTokenIds).map(([outcome, tokenId]) => (
                <div key={outcome} className="flex items-center justify-between">
                  <span className="label" style={{ fontSize: 10 }}>{outcome} Token</span>
                  <HashScanLink
                    id={tokenId}
                    url={market.outcomeTokenUrls[outcome] ?? '#'}
                  />
                </div>
              ))}
              <div className="flex items-center justify-between">
                <span className="label" style={{ fontSize: 10 }}>Creator</span>
                <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                  {market.creatorAccountId}
                </span>
              </div>
              {market.resolvedOutcome && (
                <div className="flex items-center justify-between">
                  <span className="label" style={{ fontSize: 10 }}>Resolved</span>
                  <span className="font-mono text-xs" style={{ color: 'var(--accent)' }}>
                    {market.resolvedOutcome}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add packages/ui/src/pages/MarketDetail.tsx
git commit -m "feat(ui): MarketDetail drawer — odds, orderbook, sparkline, on-chain metadata"
```

---

### Task 19: Agents Page with Trust Graph

**Files:**
- Modify: `packages/ui/src/pages/Agents.tsx`
- Create: `packages/ui/src/components/TrustGraph.tsx`

**Step 1: Create `packages/ui/src/components/TrustGraph.tsx`**

```tsx
import * as d3 from 'd3'
import { useEffect, useRef } from 'react'
import type { TrustGraph } from '../api/types'

interface TrustGraphProps {
  graph: TrustGraph
  width?: number
  height?: number
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  weight: number
  attestations: number
}

export function TrustGraphViz({ graph, width = 320, height = 280 }: TrustGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || graph.nodes.length === 0) return

    const el = d3.select(svg)
    el.selectAll('*').remove()

    const nodes: SimNode[] = graph.nodes.map(id => ({ id }))
    const links: SimLink[] = graph.edges.map(e => ({
      source: e.from,
      target: e.to,
      weight: e.weight,
      attestations: e.attestations,
    }))

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink<SimNode, SimLink>(links).id(d => d.id).distance(60))
      .force('charge', d3.forceManyBody().strength(-80))
      .force('center', d3.forceCenter(width / 2, height / 2))

    const link = el.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#D4917A')
      .attr('stroke-opacity', d => Math.min(0.8, 0.2 + Math.abs(d.weight) * 0.6))
      .attr('stroke-width', d => Math.max(0.5, Math.min(2, d.attestations * 0.4)))

    const node = el.append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', 5)
      .attr('fill', '#1A1A1A')
      .attr('stroke', '#D4917A')
      .attr('stroke-width', 1)

    const label = el.append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .text(d => d.id.slice(0, 8))
      .attr('font-size', 8)
      .attr('font-family', 'monospace')
      .attr('fill', '#6B6460')
      .attr('text-anchor', 'middle')
      .attr('dy', -8)

    sim.on('tick', () => {
      link
        .attr('x1', d => (d.source as SimNode).x ?? 0)
        .attr('y1', d => (d.source as SimNode).y ?? 0)
        .attr('x2', d => (d.target as SimNode).x ?? 0)
        .attr('y2', d => (d.target as SimNode).y ?? 0)

      node
        .attr('cx', d => d.x ?? 0)
        .attr('cy', d => d.y ?? 0)

      label
        .attr('x', d => d.x ?? 0)
        .attr('y', d => d.y ?? 0)
    })

    return () => { sim.stop() }
  }, [graph, width, height])

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      style={{ background: 'var(--bg-raised)', borderRadius: 8 }}
    />
  )
}
```

**Step 2: Replace `Agents.tsx`**

```tsx
import { useState } from 'react'
import type { Agent } from '../api/types'
import { AgentCard } from '../components/AgentCard'
import { Drawer } from '../components/Drawer'
import { HashScanLink } from '../components/HashScanLink'
import { TrustGraphViz } from '../components/TrustGraph'
import { DitherPanel } from '../components/dither/DitherPanel'
import { PageHeader } from '../components/layout/PageHeader'
import { useAgents } from '../hooks/useAgents'
import { useLeaderboard, useTrustGraph } from '../hooks/useReputation'

function AgentDrawerContent({ agent }: { agent: Agent }) {
  const { data: graph } = useTrustGraph()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="scanline-zone relative px-6 py-6 shrink-0"
        style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border)', minHeight: 100 }}
      >
        <DitherPanel pattern="bayer4" intensity={0.08} className="absolute inset-0" />
        <div className="relative z-10">
          <p className="label mb-1">{agent.accountId}</p>
          <h2 className="text-primary font-light" style={{ fontSize: 24 }}>{agent.name}</h2>
          <span
            className="label mt-2 inline-block"
            style={{
              fontSize: 10,
              background: 'var(--bg-raised)',
              border: '1px solid var(--border)',
              padding: '2px 8px',
              borderRadius: 4,
            }}
          >
            {agent.strategy}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Stats */}
        <section className="px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="label mb-3">Stats</p>
          <div className="flex flex-col gap-3">
            <div className="flex justify-between">
              <span className="label" style={{ fontSize: 10 }}>Reputation</span>
              <span className="font-mono text-xs text-primary">{agent.reputationScore} / 100</span>
            </div>
            <div
              className="w-full overflow-hidden rounded-sm"
              style={{ height: 6, background: 'var(--bg-raised)' }}
            >
              <div
                style={{ width: `${agent.reputationScore}%`, height: '100%', background: 'var(--accent-dim)' }}
              />
            </div>
            <div className="flex justify-between">
              <span className="label" style={{ fontSize: 10 }}>Bankroll</span>
              <span className="font-mono text-xs text-primary">{agent.bankrollHbar.toFixed(4)} ℏ</span>
            </div>
          </div>
        </section>

        {/* Trust graph */}
        {graph && graph.nodes.length > 0 && (
          <section className="px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="label mb-3">Trust Graph</p>
            <TrustGraphViz graph={graph} width={400} height={240} />
          </section>
        )}

        {/* On-chain */}
        <section
          className="relative px-6 py-5 scanline-zone"
          style={{ background: 'var(--bg-raised)' }}
        >
          <DitherPanel pattern="bayer4" intensity={0.06} className="absolute inset-0" />
          <div className="relative z-10">
            <p className="label mb-3">On-Chain</p>
            <div className="flex items-center justify-between">
              <span className="label" style={{ fontSize: 10 }}>Account ID</span>
              <HashScanLink
                id={agent.accountId}
                url={`https://hashscan.io/testnet/account/${agent.accountId}`}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export function Agents() {
  const { data: agents = [], isLoading } = useAgents()
  const { data: leaderboard = [] } = useLeaderboard()
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)

  // Sort by rep score for ranking
  const sorted = [...agents].sort((a, b) => b.reputationScore - a.reputationScore)

  return (
    <div className="flex flex-col min-h-screen">
      <PageHeader title="Agents" meta={`${agents.length} registered`} />

      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 120px)' }}>
        {/* Agent grid (65%) */}
        <section
          className="flex-1 overflow-y-auto px-8 py-6"
          style={{ borderRight: '1px solid var(--border)' }}
        >
          {isLoading && (
            <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  style={{ height: 160, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)' }}
                >
                  <DitherPanel pattern="diamond" intensity={0.2} width="100%" height="100%" />
                </div>
              ))}
            </div>
          )}
          {!isLoading && agents.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <DitherPanel pattern="diamond" intensity={0.3} width={120} height={80} className="mb-4" />
              <p className="label">No agents registered</p>
            </div>
          )}
          <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {sorted.map((agent, i) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                rank={i + 1}
                onClick={() => setSelectedAgent(agent)}
              />
            ))}
          </div>
        </section>

        {/* Leaderboard (35%) */}
        <aside className="overflow-y-auto" style={{ width: 280, flexShrink: 0 }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 1 }}>
            <p className="label">Reputation Leaderboard</p>
          </div>
          {leaderboard.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <p className="label">No attestations yet</p>
            </div>
          )}
          {leaderboard.map((entry, i) => (
            <div
              key={entry.accountId}
              className="flex items-center gap-3 px-5 py-3"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <span className="label" style={{ fontSize: 10, color: 'var(--accent)', minWidth: 20 }}>#{i + 1}</span>
              <span className="font-mono text-xs flex-1 truncate" style={{ color: 'var(--text-muted)' }}>
                {entry.accountId}
              </span>
              <span className="font-mono text-xs text-primary">{entry.score.toFixed(1)}</span>
            </div>
          ))}
        </aside>
      </div>

      <Drawer open={Boolean(selectedAgent)} onClose={() => setSelectedAgent(null)}>
        {selectedAgent && <AgentDrawerContent agent={selectedAgent} />}
      </Drawer>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add packages/ui/src/pages/Agents.tsx packages/ui/src/components/TrustGraph.tsx
git commit -m "feat(ui): Agents page with D3 trust graph, leaderboard, agent drawer"
```

---

### Task 20: Final Wiring + Dev Verification

**Files:**
- No new files — verify everything compiles and renders

**Step 1: Run TypeScript check**

```bash
cd /Users/madhavanp/Downloads/hederamarkets/ethdenver/packages/ui
npx tsc --noEmit
```

Expected: 0 errors.

**Step 2: Start the API server (in a separate terminal)**

```bash
cd /Users/madhavanp/Downloads/hederamarkets/ethdenver
pnpm --filter @simulacrum/api dev
```

Expected: Express server starts on port 3001.

**Step 3: Start the UI dev server**

```bash
cd /Users/madhavanp/Downloads/hederamarkets/ethdenver/packages/ui
pnpm dev
```

Expected: Vite starts on port 5173, no console errors.

**Step 4: Manual browser verification checklist**

Open `http://localhost:5173` and confirm:

- [ ] Nav sidebar renders with SIMULACRUM wordmark and dither strips
- [ ] WS dot appears (coral when API is running, dim when not)
- [ ] Dashboard: stat tiles with hatch dither background visible
- [ ] Dashboard: market grid renders (or empty dither skeleton if no markets)
- [ ] Dashboard: activity feed column renders (or "Waiting for events" label)
- [ ] `/markets` route: page header with dither band, filter bar renders
- [ ] `/agents` route: agent grid + leaderboard sidebar render
- [ ] Click any market card: Drawer slides in with MacroblockReveal animation
- [ ] Drawer closes on ESC or backdrop click
- [ ] Drawer content: on-chain section has scanline layer + dither background
- [ ] Click any agent card: Drawer opens with agent stats + trust graph section

**Step 5: Build check**

```bash
cd /Users/madhavanp/Downloads/hederamarkets/ethdenver/packages/ui
pnpm build
```

Expected: `dist/` produced, no TypeScript or Vite errors.

**Step 6: Final commit**

```bash
cd /Users/madhavanp/Downloads/hederamarkets/ethdenver
git add packages/ui/
git commit -m "feat(ui): complete Simulacrum operator UI — all 4 pages, dither system, MacroblockReveal"
```

---

## Summary

| Task | Deliverable |
|------|-------------|
| 1 | Package scaffold (Vite, React, Tailwind, pnpm install) |
| 2 | Design system CSS (tokens, scanline, typography) |
| 3 | Dither pattern library (6 patterns, canvas rendering) |
| 4 | MacroblockReveal canvas transition |
| 5 | DitherPanel with ResizeObserver |
| 6 | API client layer (typed wrappers for all endpoints) |
| 7 | App.tsx + QueryClient + stub pages |
| 8 | WebSocket provider with cache invalidation |
| 9 | TanStack Query hooks (markets, agents, reputation) |
| 10 | Shell, Nav, PageHeader layout |
| 11 | HashScanLink, OddsBar, Sparkline |
| 12 | ActivityFeed (WS event ring buffer) |
| 13 | Drawer with MacroblockReveal |
| 14 | MarketCard (vertical + horizontal modes) |
| 15 | AgentCard with rep-encoded corner dither |
| 16 | Dashboard page |
| 17 | Markets page |
| 18 | MarketDetail drawer content |
| 19 | Agents page + TrustGraphViz |
| 20 | Final verification + build check |
