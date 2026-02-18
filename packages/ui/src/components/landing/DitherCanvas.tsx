import { useEffect, useRef } from 'react'

/* ── Bayer 4x4 ordered-dither threshold matrix (0-15) ── */
const B = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5],
]

/* ── Pattern library: (x,y) => white? ── */
type PFn = (x: number, y: number) => boolean

const PAT: PFn[] = [
  /* 0  bayer ~75% */  (x, y) => B[y & 3][x & 3] > 3,
  /* 1  bayer ~56% */  (x, y) => B[y & 3][x & 3] > 6,
  /* 2  bayer ~38% */  (x, y) => B[y & 3][x & 3] > 9,
  /* 3  bayer ~19% */  (x, y) => B[y & 3][x & 3] > 12,
  /* 4  checker 4  */  (x, y) => !!((x >> 2 ^ y >> 2) & 1),
  /* 5  checker 2  */  (x, y) => !!((x >> 1 ^ y >> 1) & 1),
  /* 6  diag /     */  (x, y) => (x + y) % 6 < 3,
  /* 7  diag \     */  (x, y) => ((x - y) % 6 + 6) % 6 < 3,
  /* 8  diamond    */  (x, y) => (Math.abs(x % 8 - 4) + Math.abs(y % 8 - 4)) < 4,
  /* 9  plus       */  (x, y) => { const a = x % 10, b = y % 10; return (a >= 3 && a <= 6) || (b >= 3 && b <= 6) },
  /* 10 dots       */  (x, y) => { const a = (x % 6) - 3, b = (y % 6) - 3; return a * a + b * b < 5 },
  /* 11 h-lines    */  (_x, y) => (y & 3) < 2,
  /* 12 v-lines    */  (x, _y) => (x & 3) < 2,
  /* 13 crosshatch */  (x, y) => (x + y) % 4 === 0 || ((x - y) % 4 + 4) % 4 === 0,
]

/* ── Monolith strata (center column, high-contrast alternation) ── */
interface Stratum {
  y0: number; y1: number   // 0-1 of canvas height
  cx: number; w: number    // center-x and width as 0-1
  patIdx: number
  bright: boolean          // true = mostly white, false = mostly black
}

const STRATA: Stratum[] = [
  { y0: 0.12, y1: 0.18, cx: 0.50, w: 0.07, patIdx: 5,  bright: true },
  { y0: 0.18, y1: 0.25, cx: 0.51, w: 0.11, patIdx: 11, bright: false },
  { y0: 0.25, y1: 0.33, cx: 0.49, w: 0.15, patIdx: 0,  bright: true },
  { y0: 0.33, y1: 0.40, cx: 0.50, w: 0.13, patIdx: 6,  bright: false },
  { y0: 0.40, y1: 0.48, cx: 0.52, w: 0.17, patIdx: 4,  bright: true },
  { y0: 0.48, y1: 0.55, cx: 0.50, w: 0.15, patIdx: 13, bright: false },
  { y0: 0.55, y1: 0.62, cx: 0.48, w: 0.19, patIdx: 1,  bright: true },
  { y0: 0.62, y1: 0.70, cx: 0.50, w: 0.13, patIdx: 8,  bright: false },
  { y0: 0.70, y1: 0.78, cx: 0.51, w: 0.09, patIdx: 0,  bright: true },
  { y0: 0.78, y1: 0.85, cx: 0.50, w: 0.05, patIdx: 5,  bright: false },
]

/* ── Tile atlas ── */
interface Tile {
  patIdx: number
  grayLevel: number  // 0-1, controls white density
}

const TILE_COLS = 14
const TILE_ROWS = 10

function buildTiles(_cw: number, _ch: number): Tile[] {
  const tiles: Tile[] = []
  const cxNorm = TILE_COLS / 2
  const cyNorm = TILE_ROWS / 2
  // Deterministic hash
  let s = 42
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }

  for (let r = 0; r < TILE_ROWS; r++) {
    for (let c = 0; c < TILE_COLS; c++) {
      const dx = (c + 0.5 - cxNorm) / cxNorm
      const dy = (r + 0.5 - cyNorm) / cyNorm
      const dist = Math.sqrt(dx * dx + dy * dy)
      // Brighter near center, darker at edges
      const grayLevel = Math.max(0.05, Math.min(0.95, 0.85 - dist * 0.55 + rand() * 0.15))
      const patIdx = Math.floor(rand() * PAT.length)
      tiles.push({ patIdx, grayLevel })
    }
  }
  return tiles
}

/* ── Pixel test: is this pixel white? ── */
function isWhite(x: number, y: number, cw: number, ch: number, tiles: Tile[]): boolean {
  const nx = x / cw
  const ny = y / ch

  // Check monolith strata first
  for (const s of STRATA) {
    if (ny >= s.y0 && ny < s.y1 && nx >= s.cx - s.w / 2 && nx < s.cx + s.w / 2) {
      const pat = PAT[s.patIdx](x, y)
      if (s.bright) {
        return pat ? true : B[y & 3][x & 3] > 12
      } else {
        return pat ? B[y & 3][x & 3] > 13 : false
      }
    }
  }

  // Tile atlas
  const tc = Math.min(Math.floor(nx * TILE_COLS), TILE_COLS - 1)
  const tr = Math.min(Math.floor(ny * TILE_ROWS), TILE_ROWS - 1)
  const tile = tiles[tr * TILE_COLS + tc]

  const pat = PAT[tile.patIdx](x, y)
  const bayer = B[y & 3][x & 3] / 15
  return pat ? bayer < tile.grayLevel : bayer < tile.grayLevel * 0.15
}

/* ── Render full resolution with ImageData ── */
function renderFull(ctx: CanvasRenderingContext2D, cw: number, ch: number, tiles: Tile[]) {
  const img = ctx.createImageData(cw, ch)
  const d = img.data
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 4
      const v = isWhite(x, y, cw, ch, tiles) ? 255 : 0
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

/* ── Render macroblocks (for load animation) ── */
function renderBlocks(
  ctx: CanvasRenderingContext2D,
  cw: number, ch: number,
  tiles: Tile[],
  bs: number,
  shifts: Map<number, number>,
) {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, cw, ch)

  const cols = Math.ceil(cw / bs)
  const rows = Math.ceil(ch / bs)

  for (let br = 0; br < rows; br++) {
    const shiftPx = shifts.get(br) ?? 0
    for (let bc = 0; bc < cols; bc++) {
      const sx = Math.min(bc * bs + (bs >> 1), cw - 1)
      const sy = Math.min(br * bs + (bs >> 1), ch - 1)
      const wx = ((sx + shiftPx) % cw + cw) % cw

      if (isWhite(wx, sy, cw, ch, tiles)) {
        ctx.fillStyle = '#fff'
        ctx.fillRect(bc * bs, br * bs, bs, bs)
      }
    }
  }
}

/* ── Scanline overlay ── */
function drawScanlines(ctx: CanvasRenderingContext2D, cw: number, ch: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  for (let y = 0; y < ch; y += 3) {
    ctx.fillRect(0, y, cw, 1)
  }
}

/* ── Component ── */
export function DitherCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Size: CSS width responsive, canvas pixels = display pixels (no DPR for pixelated look)
    const displayW = Math.min(760, window.innerWidth - 48)
    const displayH = Math.round(displayW * 0.62)
    canvas.width = displayW
    canvas.height = displayH
    canvas.style.width = `${displayW}px`
    canvas.style.height = `${displayH}px`

    const cw = displayW
    const ch = displayH
    const tiles = buildTiles(cw, ch)

    /* ── Load animation: 24px → 12px → 6px → full ── */
    const phases: { bs: number; dur: number; shifts: Map<number, number> }[] = [
      { bs: 24, dur: 130, shifts: new Map([[2, 12], [5, -8], [9, 6], [14, -10]]) },
      { bs: 12, dur: 130, shifts: new Map([[4, 6], [11, -4]]) },
      { bs: 6,  dur: 120, shifts: new Map() },
    ]

    let phaseIdx = 0
    let phaseStart = performance.now()
    let rafId: number
    let destroyed = false

    function animate(now: number) {
      if (destroyed) return
      const phase = phases[phaseIdx]
      renderBlocks(ctx!, cw, ch, tiles, phase.bs, phase.shifts)

      if (now - phaseStart >= phase.dur) {
        phaseIdx++
        phaseStart = now
      }

      if (phaseIdx < phases.length) {
        rafId = requestAnimationFrame(animate)
      } else {
        // Final full-res render
        renderFull(ctx!, cw, ch, tiles)
        drawScanlines(ctx!, cw, ch)
        startIdle()
      }
    }

    rafId = requestAnimationFrame(animate)

    /* ── Idle: occasional glitches + tile swaps ── */
    const idleTimers: ReturnType<typeof setTimeout>[] = []

    function startIdle() {
      if (destroyed) return

      // Periodic tile swap
      const swapInterval = setInterval(() => {
        if (destroyed) return
        const idx = Math.floor(Math.random() * tiles.length)
        tiles[idx].patIdx = Math.floor(Math.random() * PAT.length)
        tiles[idx].grayLevel = Math.max(0.05, Math.min(0.95, tiles[idx].grayLevel + (Math.random() - 0.5) * 0.15))
        renderFull(ctx!, cw, ch, tiles)
        drawScanlines(ctx!, cw, ch)
      }, 3500)
      idleTimers.push(swapInterval as unknown as ReturnType<typeof setTimeout>)

      // Periodic row-shift glitch
      function scheduleGlitch() {
        const delay = 2500 + Math.random() * 5000
        const t = setTimeout(() => {
          if (destroyed) return
          const row = Math.floor(Math.random() * Math.ceil(ch / 6))
          const shifts = new Map<number, number>()
          shifts.set(row, (Math.random() > 0.5 ? 1 : -1) * (4 + Math.floor(Math.random() * 10)))
          shifts.set(row + 1, shifts.get(row)! * -0.5)
          renderBlocks(ctx!, cw, ch, tiles, 6, shifts)
          drawScanlines(ctx!, cw, ch)

          // Revert
          const revert = setTimeout(() => {
            if (destroyed) return
            renderFull(ctx!, cw, ch, tiles)
            drawScanlines(ctx!, cw, ch)
          }, 80)
          idleTimers.push(revert)
          scheduleGlitch()
        }, delay)
        idleTimers.push(t)
      }
      scheduleGlitch()
    }

    return () => {
      destroyed = true
      cancelAnimationFrame(rafId)
      idleTimers.forEach(clearTimeout)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      className={className}
      style={{ display: 'block', imageRendering: 'pixelated' }}
    />
  )
}
