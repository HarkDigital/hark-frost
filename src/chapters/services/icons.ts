import { SERVICES } from '../../content'

/*
 * Etched — the eleven service plates, drawn into ONE canvas atlas.
 *
 * Each cell is the face of a glass tile in reverse etching: the icon, the
 * plate number, the service name and four registration marks are the CLEAR
 * lines in a sandblasted face, so the backlight shows through them sharp.
 *
 *   R channel  the crisp etched lines (sampled by the face plate: razor sharp)
 *   G channel  the same icon, thick and blurred (sampled by the glow plate
 *              inside the glass: light bleeding into the frost around it)
 *
 * The atlas is drawn opaque (black) with additive compositing, so the two
 * channels never premultiply into each other. Glyphs are designed in a
 * 100 x 100 box centred on 0,0 (y down): hairline strokes, round caps.
 */

type Ctx = CanvasRenderingContext2D
type Pt = [number, number]

function poly(g: Ctx, pts: Pt[], close = false) {
  g.beginPath()
  g.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1])
  if (close) g.closePath()
  g.stroke()
}

function circle(g: Ctx, x: number, y: number, r: number, fill = false) {
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  if (fill) g.fill()
  else g.stroke()
}

function rrect(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  g.beginPath()
  g.moveTo(x + rr, y)
  g.arcTo(x + w, y, x + w, y + h, rr)
  g.arcTo(x + w, y + h, x, y + h, rr)
  g.arcTo(x, y + h, x, y, rr)
  g.arcTo(x, y, x + w, y, rr)
  g.closePath()
  g.stroke()
}

/** a four-point sparkle (concave star) centred at x,y with radius r */
function sparkle(g: Ctx, x: number, y: number, r: number) {
  const k = r * 0.16
  g.beginPath()
  g.moveTo(x, y - r)
  g.quadraticCurveTo(x + k, y - k, x + r, y)
  g.quadraticCurveTo(x + k, y + k, x, y + r)
  g.quadraticCurveTo(x - k, y + k, x - r, y)
  g.quadraticCurveTo(x - k, y - k, x, y - r)
  g.closePath()
  g.stroke()
}

/** One glyph per service slug (fallback: a diamond). */
const GLYPHS: Record<string, (g: Ctx) => void> = {
  // </> — code
  'software-development': g => {
    poly(g, [[-19, -23], [-42, 0], [-19, 23]])
    poly(g, [[19, -23], [42, 0], [19, 23]])
    poly(g, [[8, -33], [-8, 33]])
  },
  // a browser window with a layout grid
  'web-design': g => {
    rrect(g, -45, -34, 90, 68, 5)
    poly(g, [[-45, -19], [45, -19]])
    circle(g, -37, -26.5, 1.4, true)
    circle(g, -31, -26.5, 1.4, true)
    circle(g, -25, -26.5, 1.4, true)
    poly(g, [[-12, -19], [-12, 34]])
    poly(g, [[-12, 6], [45, 6]])
    poly(g, [[-38, -9], [-20, -9]])
    poly(g, [[-38, -1], [-24, -1]])
  },
  // a cart
  ecommerce: g => {
    poly(g, [[-47, -31], [-36, -31], [-25, 13], [31, 13], [40, -19], [-32, -19]])
    poly(g, [[-29.5, -3], [36, -3]])
    circle(g, -17, 27, 5)
    circle(g, 24, 27, 5)
  },
  // a magnifier with a spark (search + generative answers)
  'seo-geo': g => {
    circle(g, -9, -9, 27)
    poly(g, [[10.5, 10.5], [40, 40]])
    sparkle(g, -9, -9, 13)
  },
  // a lightning bolt
  'page-speed': g => {
    poly(
      g,
      [
        [9, -47],
        [-25, 7],
        [-2, 7],
        [-10, 47],
        [25, -9],
        [2, -9],
      ],
      true,
    )
  },
  // a chip with a sparkle
  'ai-consulting': g => {
    rrect(g, -27, -27, 54, 54, 5)
    for (const o of [-14, 0, 14]) {
      poly(g, [[o, -27], [o, -39]])
      poly(g, [[o, 27], [o, 39]])
      poly(g, [[-27, o], [-39, o]])
      poly(g, [[27, o], [39, o]])
    }
    sparkle(g, 0, 0, 15)
  },
  // a quadcopter, top-down
  'aerial-media': g => {
    rrect(g, -9, -9, 18, 18, 4)
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as Pt[]) {
      poly(g, [[sx * 8, sy * 8], [sx * 22, sy * 22]])
      circle(g, sx * 30, sy * 30, 13)
      circle(g, sx * 30, sy * 30, 1.6, true)
    }
  },
  // a cross: repair
  'hack-remediation': g => {
    const a = 11
    const b = 38
    poly(
      g,
      [
        [-a, -b],
        [a, -b],
        [a, -a],
        [b, -a],
        [b, a],
        [a, a],
        [a, b],
        [-a, b],
        [-a, a],
        [-b, a],
        [-b, -a],
        [-a, -a],
      ],
      true,
    )
  },
  // a shield with a check
  security: g => {
    g.beginPath()
    g.moveTo(0, -45)
    g.bezierCurveTo(14, -35, 26, -33, 38, -32)
    g.lineTo(38, 0)
    g.bezierCurveTo(38, 22, 20, 37, 0, 47)
    g.bezierCurveTo(-20, 37, -38, 22, -38, 0)
    g.lineTo(-38, -32)
    g.bezierCurveTo(-26, -33, -14, -35, 0, -45)
    g.closePath()
    g.stroke()
    poly(g, [[-14, 2], [-4, 13], [16, -11]])
  },
  // the accessibility figure
  'ada-accessibility': g => {
    circle(g, 0, 0, 45)
    circle(g, 0, -24, 5.5)
    poly(g, [[-24, -11], [0, -7], [24, -11]])
    poly(g, [[0, -7], [0, 10]])
    poly(g, [[-14, 33], [0, 10], [14, 33]])
  },
  // W in a ring
  wordpress: g => {
    circle(g, 0, 0, 45)
    poly(g, [[-30, -17], [-16, 24], [0, -9], [16, 24], [30, -17]])
  },
}

const diamond = (g: Ctx) =>
  poly(
    g,
    [
      [0, -34],
      [34, 0],
      [0, 34],
      [-34, 0],
    ],
    true,
  )

/** letter-spaced text, drawn glyph by glyph (canvas letterSpacing is missing in Safari) */
function spaced(g: Ctx, text: string, x: number, y: number, track: number) {
  let cx = x
  for (const ch of text) {
    g.fillText(ch, cx, y)
    cx += g.measureText(ch).width + track
  }
}

export const COLS = 3
export const ROWS = Math.ceil(SERVICES.length / COLS)

export interface Atlas {
  canvas: HTMLCanvasElement
  cellW: number
  cellH: number
  /** redraw (after the mono web font loads) */
  draw: () => void
  /** uv rectangle of cell i: [u0, v0, u1, v1] (v up, CanvasTexture flipY) */
  rect: (i: number) => [number, number, number, number]
}

/**
 * The atlas: COLS x ROWS cells, each cellW x cellH px (the face plate's
 * aspect). `weight` thickens the lines on phones, where the plate is small.
 */
export function buildAtlas(cellW: number, cellH: number, weight = 1): Atlas {
  const n = SERVICES.length
  const canvas = document.createElement('canvas')
  canvas.width = cellW * COLS
  canvas.height = cellH * ROWS
  const g = canvas.getContext('2d')!
  const mono = "'Fragment Mono', ui-monospace, monospace"

  const draw = () => {
    g.globalCompositeOperation = 'source-over'
    g.fillStyle = '#000000'
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.globalCompositeOperation = 'lighter'
    for (let i = 0; i < n; i++) {
      const svc = SERVICES[i]
      const ox = (i % COLS) * cellW
      const oy = Math.floor(i / COLS) * cellH
      g.save()
      g.beginPath()
      g.rect(ox, oy, cellW, cellH)
      g.clip()
      g.translate(ox, oy)
      const u = cellH / 100 // layout unit: 1% of the cell height

      // ---- registration marks: four hairline corners (R)
      g.strokeStyle = 'rgb(150,0,0)'
      g.lineWidth = Math.max(1, 0.32 * u * weight)
      g.lineCap = 'butt'
      const m = 6.5 * u
      const L = 5 * u
      for (const [cx, cy, sx, sy] of [
        [m, m, 1, 1],
        [cellW - m, m, -1, 1],
        [m, cellH - m, 1, -1],
        [cellW - m, cellH - m, -1, -1],
      ]) {
        poly(g, [[cx, cy + sy * L], [cx, cy], [cx + sx * L, cy]])
      }

      // ---- the plate number, top left, and the name, bottom left (R)
      g.textBaseline = 'alphabetic'
      g.textAlign = 'left'
      g.fillStyle = 'rgb(235,0,0)'
      g.font = `400 ${Math.round(6.4 * u)}px ${mono}`
      spaced(g, svc.num, m + 3.2 * u, m + 9.6 * u, 0.2 * u)
      g.fillStyle = 'rgb(200,0,0)'
      g.font = `400 ${Math.round(3.5 * u)}px ${mono}`
      spaced(g, svc.title.toUpperCase(), m + 3.2 * u, cellH - m - 2.6 * u, 0.62 * u)
      // "/ 11" next to the number, fainter
      g.fillStyle = 'rgb(120,0,0)'
      g.font = `400 ${Math.round(3.5 * u)}px ${mono}`
      spaced(g, `/ ${String(n).padStart(2, '0')}`, m + 3.2 * u + 10.6 * u, m + 9.6 * u, 0.4 * u)

      // ---- the icon: a soft glow pass (G), then the crisp line (R)
      const gs = (cellH * 0.44) / 100 // icon box ≈ 44% of the cell height
      g.translate(cellW / 2, cellH * 0.5)
      g.scale(gs, gs)
      g.lineJoin = 'round'
      g.lineCap = 'round'
      const glyph = GLYPHS[svc.slug] ?? diamond
      g.strokeStyle = 'rgb(0,150,0)'
      g.fillStyle = 'rgb(0,150,0)'
      g.lineWidth = (6.2 * weight * u) / gs
      g.shadowColor = 'rgb(0,255,0)'
      g.shadowBlur = 5.5 * u
      glyph(g)
      g.shadowBlur = 0
      g.shadowColor = 'transparent'
      g.strokeStyle = 'rgb(255,0,0)'
      g.fillStyle = 'rgb(255,0,0)'
      g.lineWidth = (0.78 * weight * u) / gs
      glyph(g)
      g.restore()
    }
    g.globalCompositeOperation = 'source-over'
  }
  draw()

  const rect = (i: number): [number, number, number, number] => {
    const c = i % COLS
    const r = Math.floor(i / COLS)
    const u0 = c / COLS
    const u1 = (c + 1) / COLS
    // flipY: canvas row 0 is the top of the texture (v = 1)
    const v1 = 1 - r / ROWS
    const v0 = 1 - (r + 1) / ROWS
    return [u0, v0, u1, v1]
  }
  return { canvas, cellW, cellH, draw, rect }
}
