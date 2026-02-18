import { useEffect, useRef } from 'react'
import { drawDitherTile, type DitherPattern } from '../../lib/dither'

const PATTERNS: DitherPattern[] = ['bayer4', 'checker', 'diamond', 'hatch']

interface Block {
  x: number
  y: number
  size: number
  pattern: DitherPattern
  intensity: number
  tearOffset: number
}

interface MacroblockRevealProps {
  active: boolean
  onDone?: () => void
  className?: string
}

export function MacroblockReveal({ active, onDone, className = '' }: MacroblockRevealProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  // Fix 3: ResizeObserver sizing effect — keeps canvas pixel dims equal to parent
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return
    const obs = new ResizeObserver(() => {
      canvas.width = parent.offsetWidth
      canvas.height = parent.offsetHeight
    })
    obs.observe(parent)
    canvas.width = parent.offsetWidth
    canvas.height = parent.offsetHeight
    return () => obs.disconnect()
  }, [])

  // Fix 2: animation effect with mounted guard and no unsafe cast
  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctxOrNull = canvas.getContext('2d')
    if (!ctxOrNull) return
    const ctx: CanvasRenderingContext2D = ctxOrNull

    let mounted = true

    // Read W/H at animation start (after sizing effect has run)
    const W = canvas.width
    const H = canvas.height

    const T_SNAP     = 150
    const T_SUBDIV   = 350
    const T_DISSOLVE = 450

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
        // Updated call: pass w and h separately to match new drawDitherTile signature
        drawDitherTile(ctx, tx, b.y, b.size, b.size, b.pattern, b.intensity)
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
        drawBlocks(blocks24, 1, 0)
      } else if (elapsed < T_SUBDIV) {
        const progress = (elapsed - T_SNAP) / (T_SUBDIV - T_SNAP)
        if (progress > 0.5 && !blocks12) blocks12 = buildBlocks(12)
        if (progress > 0.85 && !blocks6) blocks6 = buildBlocks(6)
        const current = blocks6 ?? blocks12 ?? blocks24
        drawBlocks(current, 1, Math.min(progress * 2, 1))
      } else if (elapsed < T_DISSOLVE) {
        const progress = (elapsed - T_SUBDIV) / (T_DISSOLVE - T_SUBDIV)
        const alpha = 1 - progress
        const current = blocks6 ?? blocks12 ?? blocks24
        drawBlocks(current, alpha, 1)
      } else {
        ctx.clearRect(0, 0, W, H)
        cancelAnimationFrame(rafRef.current)
        if (mounted) onDone?.()
        return
      }

      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)
    return () => {
      mounted = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [active, onDone])

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={{ display: active ? 'block' : 'none', width: '100%', height: '100%' }}
    />
  )
}
