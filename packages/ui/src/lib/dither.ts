export type DitherPattern = 'bayer4' | 'checker' | 'diamond' | 'hatch' | 'plus' | 'stair'

export const BAYER4 = [
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
 * Draw a dither tile using ImageData (fast — one putImageData call per tile).
 * w and h allow partial tiles at edges.
 */
export function drawDitherTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  pattern: DitherPattern,
  intensity: number,
  hiHex = '#E8E4DF',
  loHex = '#1E1C1A',
): void {
  if (w <= 0 || h <= 0) return
  const imageData = ctx.createImageData(w, h)
  const data = imageData.data
  const threshold = 1 - intensity
  const hi = hexToRgb(hiHex)
  const lo = hexToRgb(loHex)

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      let on = false
      const tileSize = Math.max(w, h)

      if (pattern === 'bayer4') {
        on = BAYER4[py % 4][px % 4] / 15 >= threshold
      } else if (pattern === 'checker') {
        on = (px + py) % 2 === 0 ? intensity > 0.25 : intensity > 0.75
      } else if (pattern === 'diamond') {
        const cx = w / 2, cy = h / 2
        const d = (Math.abs(px - cx) + Math.abs(py - cy)) / tileSize
        on = d < intensity * 0.7
      } else if (pattern === 'hatch') {
        on = (px + py) % 4 < Math.round(intensity * 4)
      } else if (pattern === 'plus') {
        const mx = px % 4, my = py % 4
        const cross = mx === 2 || my === 2
        const dot = mx === 2 && my === 2
        on = cross ? intensity > 0.3 : dot && intensity > 0.7
      } else if (pattern === 'stair') {
        const step = Math.min(3, Math.floor(px / Math.max(1, w / 4)))
        on = py > h - (step + 1) * (h / 4) * intensity
      }

      const color = on ? hi : lo
      const i = (py * w + px) * 4
      data[i]     = color[0]
      data[i + 1] = color[1]
      data[i + 2] = color[2]
      data[i + 3] = 255
    }
  }

  ctx.putImageData(imageData, x, y)
}

/**
 * Fill an entire canvas with a dither mosaic of tileSize×tileSize blocks.
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
      drawDitherTile(
        ctx, x, y,
        Math.min(tileSize, canvas.width - x),
        Math.min(tileSize, canvas.height - y),
        pattern, intensity,
      )
    }
  }
}

/**
 * Map a 0–1 data value to a DitherPattern + intensity pair.
 */
export function dataToPattern(value: number): { pattern: DitherPattern; intensity: number } {
  const clamped = Math.max(0, Math.min(1, value))
  if (clamped < 0.2) return { pattern: 'diamond',  intensity: 0.2 + clamped }
  if (clamped < 0.5) return { pattern: 'bayer4',   intensity: 0.3 + clamped * 0.8 }
  if (clamped < 0.8) return { pattern: 'checker',  intensity: 0.4 + clamped * 0.6 }
  return                     { pattern: 'checker',  intensity: 0.9 }
}
