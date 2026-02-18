# Simulacrum UI — Design Document

> **Status:** Approved. Ready for implementation plan.

---

## Overview

A production `packages/ui` Vite + React 18 SPA — the operator interface for the Simulacrum prediction market. Black-first, modern, premium. Interrupted by intentional retro-computation artifacts: ordered dither mosaics, CRT scanlines, and blocky macroblock glitch reveals.

**Stack:** Vite + React 18 + TypeScript + TailwindCSS + TanStack Query + React Router v6
**API:** Wires to real `packages/api` Express server at `localhost:3001`. WebSocket at `/ws` drives live invalidation.

---

## Package Structure

```
packages/ui/
├── src/
│   ├── main.tsx
│   ├── App.tsx                     # Router root + QueryClientProvider + WS provider
│   ├── api/
│   │   ├── client.ts               # Base fetch wrapper (baseURL, error handling)
│   │   ├── markets.ts
│   │   ├── agents.ts
│   │   ├── reputation.ts
│   │   └── autonomy.ts
│   ├── hooks/
│   │   ├── useWebSocket.ts         # WS connection + queryClient.invalidateQueries
│   │   ├── useMarkets.ts
│   │   ├── useAgents.ts
│   │   └── useReputation.ts
│   ├── components/
│   │   ├── dither/
│   │   │   ├── DitherPanel.tsx     # Reusable dither mosaic panel (SVG pattern atlas)
│   │   │   └── MacroblockReveal.tsx # Signature macroblock transition canvas overlay
│   │   ├── layout/
│   │   │   ├── Shell.tsx           # App shell: fixed left nav + main content
│   │   │   ├── Nav.tsx             # Left nav with dither accent strip + WS dot
│   │   │   └── PageHeader.tsx      # Per-page header with thin dither band
│   │   ├── MarketCard.tsx
│   │   ├── AgentCard.tsx
│   │   ├── OddsBar.tsx             # Dither-edge odds fill bar
│   │   ├── Sparkline.tsx           # SVG sparkline fading to dither at tail
│   │   ├── ActivityFeed.tsx        # Real-time WS event stream
│   │   ├── Drawer.tsx              # Right slide-in drawer with MacroblockReveal
│   │   └── HashScanLink.tsx        # Monospace on-chain ID + copy button
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Markets.tsx
│   │   ├── MarketDetail.tsx        # Rendered inside Drawer
│   │   └── Agents.tsx
│   └── styles/
│       ├── globals.css             # Base reset, CSS vars, scanline keyframes
│       └── dither.css              # SVG pattern defs as CSS custom property data URIs
├── index.html
├── vite.config.ts
├── tailwind.config.ts
└── package.json
```

---

## Design System

### Color Tokens (CSS custom properties)

```css
--bg-base:      #0D0D0D   /* matte near-black */
--bg-surface:   #141414   /* cards, drawers */
--bg-raised:    #1A1A1A   /* hover, active panels */
--border:       #2A2A2A   /* 1px hairline borders */
--text-primary: #F0EDE8   /* warm off-white */
--text-muted:   #6B6460   /* metadata, labels */
--text-dim:     #3D3A38   /* disabled, placeholder */
--accent:       #D4917A   /* Anthropic coral */
--accent-dim:   #8C5A47   /* accent fills */
--dither-hi:    #E8E4DF   /* dither "on" pixel */
--dither-lo:    #1E1C1A   /* dither "off" pixel */
```

### Typography

- **Font:** Inter variable (`@fontsource/inter`)
- **Editorial titles:** 32–48px, weight 300, letter-spacing -0.02em
- **Card titles:** 14px, weight 500
- **Metadata labels:** 11px, weight 400, letter-spacing 0.08em, uppercase
- **On-chain IDs:** system mono stack, 12px
- **Baseline grid:** 8px

### Dither Pattern Atlas (6 patterns)

Implemented as SVG `<pattern>` tiles encoded as `url("data:image/svg+xml,...")` CSS custom properties:

| Name | Tile | Usage |
|------|------|-------|
| `dither-bayer4` | 4×4 Bayer ordered | Default workhorse pattern |
| `dither-checker` | 2×2 checkerboard | High-density state |
| `dither-diamond` | Diagonal diamond lattice | Low-rep agents |
| `dither-hatch` | 45° diagonal lines | Stat tile backgrounds |
| `dither-plus` | 4px plus-sign clusters | Card accent strips |
| `dither-stair` | Pixel stair-step ramp | Sparkline fade tail |

`DitherPanel` props: `pattern`, `intensity: 0–1` (maps to dither-hi/dither-lo pixel density).
Data encoding: **volume → intensity** (MarketCard strip), **reputation score → pattern density** (AgentCard corner patch).

### CRT Scanline Layer

Applied only to: drawer header, hero stat bands, card texture panels.

```css
.scanline-zone::after {
  content: '';
  background: repeating-linear-gradient(
    0deg, transparent, transparent 2px,
    rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 3px
  );
  pointer-events: none;
  position: absolute; inset: 0; z-index: 1;
}
```

### Macroblock Reveal Transition

Canvas overlay component. Triggered on: drawer open, page navigation, action confirmation.

1. **0ms:** Canvas fills with 24px macroblocks, each a random dither pattern at 2–4 tone levels
2. **0–150ms:** Blocks snap to rigid grid
3. **150–350ms:** Blocks subdivide 24→12→6px (stepped, not smooth)
4. **350–450ms:** Blocks dissolve opacity 1→0, revealing UI beneath
5. **Tears:** ~8% of blocks translate 6–10px horizontally before dissolving

All timing: `linear` or `steps(1)`. No spring/bounce easing.

---

## Pages

### Dashboard (`/`)

- **Stats band** (top): 4 inline stat tiles — Total Volume, Open Markets, Active Agents, Resolved Today. `dither-hatch` background at 6% opacity.
- **Main (60%):** Active markets 2-column `MarketCard` grid. Each card: 100px right-strip `DitherPanel` (volume-encoded), `OddsBar` with dither-stepped fill edge.
- **Sidebar (40%):** `ActivityFeed` — real-time WS events. Single-line rows: timestamp | event type badge | description. Click → opens `Drawer`.

### Markets (`/markets`)

- `PageHeader` with editorial "MARKETS" + thin dither band.
- Horizontal `MarketCard` rows: question | status badge | odds pills | volume | creator ID (mono) | close time.
- Row hover: `--bg-raised` + 1px accent left border.
- Click row → `Drawer` with `MacroblockReveal`.

### Market Detail Drawer (480px, slides from right)

- **Header (120px):** Market question in large editorial type, status badge. Scanline layer. Dither strip top edge.
- **Odds:** Large `OddsBar` + YES/NO percentages in 32px type.
- **Orderbook:** Bid/ask two-column mono table, 12px tight rows.
- **Bet history:** Scrollable — agent ID | outcome | amount | HashScan link.
- **On-chain metadata:** `dither-bayer4` background, monospace IDs (topic, tokens), copy buttons. CRT scanline.
- **Sparkline:** Volume over time, tail fades into `dither-stair`.

### Agents (`/agents`)

- **Left (65%):** `AgentCard` grid. Corner dither patch (60px, top-right) encodes rep score: low = sparse `dither-diamond`, high = dense `dither-bayer4`. Card: name, account ID (mono), strategy badge, bankroll, rep bar.
- **Right (35%):** Reputation leaderboard — ranked, sticky, independently scrollable.
- Click agent → `Drawer` with rep breakdown, attestation list, D3 force trust graph (accent-colored edges), recent bets.

### Autonomy Modal (from nav pill)

Centered modal overlay with `MacroblockReveal`. Engine status, tick count, agent count. Start/Stop with confirmation macroblock animation.

---

## Data Flow

### REST (TanStack Query)

| Hook | Query key | Endpoint |
|------|-----------|----------|
| `useMarkets()` | `['markets']` | `GET /markets` |
| `useMarket(id)` | `['markets', id]` | `GET /markets/:id` |
| `useOrderBook(id)` | `['orderbook', id]` | `GET /markets/:id/orderbook` |
| `useAgents()` | `['agents']` | `GET /agents` |
| `useLeaderboard()` | `['reputation', 'leaderboard']` | `GET /reputation/leaderboard` |
| `useTrustGraph()` | `['reputation', 'trust-graph']` | `GET /reputation/trust-graph` |
| `useAutonomyStatus()` | `['autonomy', 'status']` | `GET /autonomy/status` |

### WebSocket Invalidation Map

| WS event type | Invalidates |
|---------------|-------------|
| `market.created` | `['markets']` |
| `market.bet` | `['markets', id]`, `['orderbook', id]` |
| `market.resolved` | `['markets', id]` |
| `market.claimed` | `['markets', id]` |
| `agent.created` | `['agents']` |
| `reputation.attested` | `['reputation', 'leaderboard']`, `['reputation', 'trust-graph']` |

Activity feed consumes raw WS events directly (no query cache — append-only ring buffer, max 200 events).

---

## Don'ts

- No neon gradients, no glassmorphism, no rainbow status colors, no full-screen dither filter
- Dither is a material accent — never noise
- No bouncy/spring easing anywhere
- No shadows on cards — hairline borders only
