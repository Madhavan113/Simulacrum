import { useEffect, useRef } from 'react'

function renderField(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  spacing: number,
  seed: number,
) {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)

  const lineCount = Math.ceil(h / spacing) + 40
  const coarse = spacing > 4

  ctx.strokeStyle = '#fff'
  ctx.lineWidth = coarse ? spacing * 0.4 : 1

  for (let i = -20; i < lineCount; i++) {
    const baseY = i * spacing
    const ny = baseY / h
    ctx.beginPath()

    const step = coarse ? spacing : 2
    for (let x = 0; x <= w; x += step) {
      const nx = x / w
      const dx = nx - 0.5
      const dy = ny - 0.5
      const dist = Math.sqrt(dx * dx + dy * dy)
      const strength = Math.max(0, 1 - dist * 1.6)
      const s2 = strength * strength

      const w1 = Math.sin(nx * 14 + seed + ny * 5) * 11 * strength
      const w2 = Math.sin(nx * 8.5 - seed * 0.6 + ny * 8) * 7 * strength
      const w3 = Math.sin((nx + ny) * 9 + seed * 0.3) * 4 * s2

      const y = baseY + w1 + w2 + w3

      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }

    ctx.stroke()
  }
}

function addScanlines(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.1)'
  for (let y = 0; y < h; y += 3) {
    ctx.fillRect(0, y, w, 1)
  }
}

export function WaveField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const displayW = Math.min(760, window.innerWidth - 48)
    const displayH = Math.round(displayW * 0.48)
    canvas.width = displayW
    canvas.height = displayH
    canvas.style.width = `${displayW}px`
    canvas.style.height = `${displayH}px`

    let destroyed = false
    const seed = 1.7

    const phases = [
      { spacing: 12, dur: 140 },
      { spacing: 6, dur: 130 },
      { spacing: 3, dur: 110 },
    ]

    let phaseIdx = 0
    let phaseStart = performance.now()
    let rafId: number

    function animate(now: number) {
      if (destroyed) return
      const phase = phases[phaseIdx]
      renderField(ctx!, displayW, displayH, phase.spacing, seed)

      if (now - phaseStart >= phase.dur) {
        phaseIdx++
        phaseStart = now
      }

      if (phaseIdx < phases.length) {
        rafId = requestAnimationFrame(animate)
      } else {
        renderField(ctx!, displayW, displayH, 2, seed)
        addScanlines(ctx!, displayW, displayH)
        startIdle()
      }
    }

    rafId = requestAnimationFrame(animate)

    const idleTimers: ReturnType<typeof setTimeout>[] = []

    function startIdle() {
      if (destroyed) return
      let currentSeed = seed

      function scheduleShift() {
        const delay = 4000 + Math.random() * 6000
        const t = setTimeout(() => {
          if (destroyed) return
          currentSeed += (Math.random() - 0.5) * 0.2
          renderField(ctx!, displayW, displayH, 2, currentSeed)
          addScanlines(ctx!, displayW, displayH)
          scheduleShift()
        }, delay)
        idleTimers.push(t)
      }
      scheduleShift()
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
      style={{ display: 'block' }}
    />
  )
}
