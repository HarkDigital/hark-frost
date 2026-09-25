import * as THREE from 'three'
import { logoShapes } from '../../logo/logo'
import { nextFrame } from '../../core/yield'

/*
 * The resist pattern of the process pane as a SIGNED DISTANCE FIELD, so the
 * Hark mark stays razor sharp at any zoom: shaders read the distance and
 * antialias the edge in screen space (smoothstep over fwidth), and draw
 * hairlines of constant pixel width along it.
 *
 * The pattern (the areas the resist keeps CLEAR): the Hark mark, centered,
 * plus a fine keyline frame inset from the pane's edge.
 *
 * Distances come from an exact Euclidean distance transform (Felzenszwalb &
 * Huttenlocher) seeded with the canvas's antialiased coverage, so the edge
 * is placed with sub-texel precision.
 */

export interface PatternSdf {
  tex: THREE.DataTexture
  /** world units per unit of (value - 0.5): sd = (texel - 0.5) * scale */
  scale: number
}

export interface PatternOpts {
  /** pane face size (world units) */
  w: number
  h: number
  /** mark height (world units) and its center offset in y */
  markH: number
  markY?: number
  /** keyline: inset from the face edge and stroke width (world units); 0 = none */
  keyInset?: number
  keyWidth?: number
  keyRadius?: number
  /** texels across the pane's width */
  res: number
  /** texels of distance encoded on each side of the edge */
  spread?: number
}

const INF = 1e20

function edt1d(grid: Float64Array, offset: number, stride: number, length: number, f: Float64Array, v: Uint16Array, z: Float64Array) {
  v[0] = 0
  z[0] = -INF
  z[1] = INF
  f[0] = grid[offset]
  for (let q = 1, k = 0, s = 0; q < length; q++) {
    f[q] = grid[offset + q * stride]
    const q2 = q * q
    do {
      const r = v[k]
      s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2
    } while (s <= z[k] && --k > -1)
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = INF
  }
  for (let q = 0, k = 0; q < length; q++) {
    while (z[k + 1] < q) k++
    const r = v[k]
    const qr = q - r
    grid[offset + q * stride] = f[r] + qr * qr
  }
}

function edt(grid: Float64Array, width: number, height: number) {
  const n = Math.max(width, height)
  const f = new Float64Array(n)
  const v = new Uint16Array(n)
  const z = new Float64Array(n + 1)
  for (let x = 0; x < width; x++) edt1d(grid, x, width, height, f, v, z)
  for (let y = 0; y < height; y++) edt1d(grid, y * width, 1, width, f, v, z)
}

function roundRectPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.moveTo(x + r, y)
  g.lineTo(x + w - r, y)
  g.arcTo(x + w, y, x + w, y + r, r)
  g.lineTo(x + w, y + h - r)
  g.arcTo(x + w, y + h, x + w - r, y + h, r)
  g.lineTo(x + r, y + h)
  g.arcTo(x, y + h, x, y + h - r, r)
  g.lineTo(x, y + r)
  g.arcTo(x, y, x + r, y, r)
  g.closePath()
}

export async function buildPatternSdf(o: PatternOpts): Promise<PatternSdf> {
  const W = Math.round(o.res)
  const H = Math.round((o.res * o.h) / o.w)
  const spread = o.spread ?? 24
  const k = W / o.w // texels per world unit
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d', { willReadFrequently: true })!
  g.fillStyle = '#000'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#fff'
  // world (pane-local, y up, centered) → canvas
  const X = (x: number) => (x + o.w / 2) * k
  const Y = (y: number) => (o.h / 2 - y) * k
  const s = o.markH
  const my = o.markY ?? 0
  for (const shape of logoShapes()) {
    const pts = shape.extractPoints(12)
    g.beginPath()
    const ring = (p: THREE.Vector2[]) => {
      p.forEach((v, i) => (i ? g.lineTo(X(v.x * s), Y(v.y * s + my)) : g.moveTo(X(v.x * s), Y(v.y * s + my))))
      g.closePath()
    }
    ring(pts.shape)
    for (const hole of pts.holes) ring(hole)
    g.fill('evenodd')
  }
  if (o.keyInset && o.keyWidth) {
    const i = o.keyInset
    const r = o.keyRadius ?? 0.04
    g.beginPath()
    roundRectPath(g, X(-o.w / 2 + i), Y(o.h / 2 - i), (o.w - 2 * i) * k, (o.h - 2 * i) * k, r * k)
    g.lineWidth = o.keyWidth * k
    g.strokeStyle = '#fff'
    g.stroke()
  }
  const img = g.getImageData(0, 0, W, H).data
  await nextFrame()

  // seed the two distance grids with sub-texel edge positions from coverage
  const N = W * H
  const outer = new Float64Array(N) // squared distance to the pattern (for outside texels)
  const inner = new Float64Array(N) // squared distance to the field (for inside texels)
  for (let i = 0; i < N; i++) {
    const a = img[i * 4] / 255
    if (a >= 0.999) {
      outer[i] = 0
      inner[i] = INF
    } else if (a <= 0.001) {
      outer[i] = INF
      inner[i] = 0
    } else {
      const d = 0.5 - a
      outer[i] = d > 0 ? d * d : 0
      inner[i] = d < 0 ? d * d : 0
    }
  }
  edt(outer, W, H)
  await nextFrame()
  edt(inner, W, H)
  await nextFrame()

  // + inside the pattern, − outside; encoded around 0.5
  const data = new Uint8Array(N)
  for (let y = 0; y < H; y++) {
    // DataTexture rows run bottom-up (flipY is off): write row y of the canvas to row H-1-y
    const src = y * W
    const dst = (H - 1 - y) * W
    for (let x = 0; x < W; x++) {
      const sd = Math.sqrt(inner[src + x]) - Math.sqrt(outer[src + x])
      data[dst + x] = Math.max(0, Math.min(255, Math.round(255 * (0.5 + sd / (2 * spread)))))
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.UnsignedByteType)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.colorSpace = THREE.NoColorSpace
  tex.unpackAlignment = 1
  tex.needsUpdate = true
  return { tex, scale: (2 * spread) / k }
}
