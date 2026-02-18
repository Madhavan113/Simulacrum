import { useEffect, useRef } from 'react'
import { dataToPattern, fillDitherMosaic, type DitherPattern } from '../../lib/dither'

interface DitherPanelProps {
  value?: number
  pattern?: DitherPattern
  intensity?: number
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

    // Set initial dimensions synchronously before observe
    canvas.width = container.offsetWidth
    canvas.height = container.offsetHeight
    render()

    const observer = new ResizeObserver(() => {
      canvas.width = container.offsetWidth
      canvas.height = container.offsetHeight
      render()
    })
    observer.observe(container)

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
