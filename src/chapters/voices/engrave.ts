import * as THREE from 'three'
import { rng } from '../../core/math'
import type { Testimonial } from '../../content'

/*
 * The engraving on each plaque: what is sandblasted into the glass.
 *
 *   “            a large opening quotation mark, top left
 *   Andrew       the client's NAME, two lines, Schibsted Grotesk
 *   Fabbri
 *   ──           a short etched rule
 *   FABBRI BUILDERS   the company, bold Schibsted Grotesk caps, tracked
 *
 * Drawn once per plaque on a canvas the size of the plaque's face, then
 * packed into a small RG texture (half the memory of a CanvasTexture):
 *   R  the frosted strokes, with a fine sandblast grain baked in (mipmaps
 *      average it away when the plaque is small, so it never shimmers)
 *   G  a soft halo around the strokes (light scattering out of the frost)
 * v = 0 is the plaque's bottom edge (inside the base), like the plane's uv.
 *
 * The site fonts only. Canvas letterSpacing doesn't exist in Safari, so the
 * tracked label is set glyph by glyph.
 */

const DISPLAY = "'Schibsted Grotesk Variable', 'Schibsted Grotesk', system-ui, sans-serif"
/** the company label: the same grotesk, bold (no monospace anywhere) */
const LABEL = DISPLAY
const LABEL_WEIGHT = 700
const NAME_WEIGHT = 560
const QUOTE_WEIGHT = 500

export interface Engraving {
  tex: THREE.DataTexture
  /** (re)draw and queue the upload; the CPU copy is dropped once it's on the GPU */
  redraw: () => void
}

let fontsPromise: Promise<boolean> | null = null

/** Load the two faces the engraving needs; true once both are ready. */
export function loadEngraveFonts(): Promise<boolean> {
  if (fontsPromise) return fontsPromise
  if (typeof document === 'undefined' || !document.fonts?.load) return (fontsPromise = Promise.resolve(false))
  fontsPromise = Promise.all([
    document.fonts.load(`${NAME_WEIGHT} 100px ${DISPLAY}`, 'Aa“'),
    document.fonts.load(`${LABEL_WEIGHT} 30px ${LABEL}`, 'AB'),
  ]).then(
    faces => faces.every(f => f.length > 0),
    () => false,
  )
  return fontsPromise
}

/** wait up to `ms` for the fonts; false if they're not there (yet) */
export async function engraveFontsReady(ms = 2500): Promise<boolean> {
  let timer = 0
  const timeout = new Promise<boolean>(r => {
    timer = window.setTimeout(() => r(false), ms)
  })
  const ok = await Promise.race([loadEngraveFonts(), timeout])
  clearTimeout(timer)
  return ok
}

/** split a name into two lines: first word / the rest */
function nameLines(name: string): string[] {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return [name]
  return [parts[0], parts.slice(1).join(' ')]
}

/** letter-spaced text, glyph by glyph (no canvas letterSpacing in Safari) */
function spacedWidth(g: CanvasRenderingContext2D, text: string, track: number) {
  let w = 0
  for (const ch of text) w += g.measureText(ch).width + track
  return w - track
}
function spaced(g: CanvasRenderingContext2D, text: string, x: number, y: number, track: number) {
  let cx = x
  for (const ch of text) {
    g.fillText(ch, cx, y)
    cx += g.measureText(ch).width + track
  }
}

/** a label that fits `maxW`: one line if it can, else two balanced lines, shrinking if it must */
function fitLabel(g: CanvasRenderingContext2D, text: string, size: number, maxW: number, trackEm: number) {
  const setSize = (s: number) => (g.font = `${LABEL_WEIGHT} ${s}px ${LABEL}`)
  setSize(size)
  if (spacedWidth(g, text, size * trackEm) <= maxW) return { lines: [text], size }
  const words = text.split(' ')
  let best: string[] = [text]
  let bestW = Infinity
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(' ')
    const b = words.slice(k).join(' ')
    const w = Math.max(spacedWidth(g, a, size * trackEm), spacedWidth(g, b, size * trackEm))
    if (w < bestW) {
      bestW = w
      best = [a, b]
    }
  }
  let s = size
  while (s > 8 && Math.max(...best.map(l => (setSize(s), spacedWidth(g, l, s * trackEm)))) > maxW) s -= 1
  return { lines: best, size: s }
}

/** A tileable sandblast grain (0..1), ~2 px grains. */
function grainField(w: number, h: number, seed: number): Float32Array {
  const rand = rng(seed)
  const a = new Float32Array(w * h)
  for (let i = 0; i < a.length; i++) a[i] = rand()
  const b = new Float32Array(w * h)
  // one 3x3 box blur: soft, rounded grains
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - 1)
    const y1 = Math.min(h - 1, y + 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - 1)
      const x1 = Math.min(w - 1, x + 1)
      let s = 0
      let n = 0
      for (let yy = y0; yy <= y1; yy++)
        for (let xx = x0; xx <= x1; xx++) {
          s += a[yy * w + xx]
          n++
        }
      b[y * w + x] = s / n
    }
  }
  return b
}

export interface EngraveLayout {
  /** canvas px */
  w: number
  h: number
  /** the uv height hidden inside the base slot (bottom) */
  slotV: number
}

/**
 * Build one engraving per testimonial. All plates share one name size (the
 * largest that fits the longest line of any name), so the row reads as a set.
 */
export function buildEngravings(list: Testimonial[], lay: EngraveLayout): { items: Engraving[]; remeasure: () => void } {
  const { w: W, h: H } = lay
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d', { willReadFrequently: true })!
  const grain = grainField(W, H, 7)

  // layout units: 1% of the plate's height
  const u = H / 100
  const mx = W * 0.115
  const maxW = W - 2 * mx
  const bottom = H * (1 - lay.slotV) // the visible bottom edge of the glass (px from top)

  let nameSize = 0
  const measure = () => {
    let widest = 0
    g.font = `${NAME_WEIGHT} 100px ${DISPLAY}`
    for (const t of list) for (const l of nameLines(t.name)) widest = Math.max(widest, g.measureText(l).width)
    nameSize = Math.min(15.5 * u, (100 * maxW) / Math.max(1, widest))
  }

  const draw = (t: Testimonial) => {
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.globalCompositeOperation = 'source-over'
    g.shadowBlur = 0
    g.shadowColor = 'transparent'
    g.fillStyle = '#000'
    g.fillRect(0, 0, W, H)
    g.textAlign = 'left'
    g.textBaseline = 'alphabetic'

    const ops: ((c: string) => void)[] = []

    // ---- the company (bottom), tracked bold caps; wraps to two lines if long
    const coSize = Math.round(3.3 * u)
    const track = 0.1
    const co = fitLabel(g, t.company.toUpperCase(), coSize, maxW, track)
    const coLine = co.size * 1.5
    const coBase = bottom - 9.5 * u
    ops.push(c => {
      g.fillStyle = c
      g.font = `${LABEL_WEIGHT} ${co.size}px ${LABEL}`
      co.lines.forEach((l, k) => spaced(g, l, mx, coBase - (co.lines.length - 1 - k) * coLine, co.size * track))
    })
    const coTop = coBase - (co.lines.length - 1) * coLine - co.size * 0.8

    // ---- the rule
    const ruleY = coTop - 3.6 * u
    ops.push(c => {
      g.fillStyle = c
      g.fillRect(mx, Math.round(ruleY), Math.round(7 * u), Math.max(2, Math.round(0.34 * u)))
    })

    // ---- the name, two lines, bottom-anchored above the rule
    const lines = nameLines(t.name)
    const lead = nameSize * 0.98
    const nameBase = ruleY - 4.4 * u
    ops.push(c => {
      g.fillStyle = c
      g.font = `${NAME_WEIGHT} ${nameSize}px ${DISPLAY}`
      lines.forEach((l, k) => g.fillText(l, mx - nameSize * 0.04, nameBase - (lines.length - 1 - k) * lead))
    })

    // ---- the opening quotation mark, top left
    const qSize = 30 * u
    ops.push(c => {
      g.fillStyle = c
      g.font = `${QUOTE_WEIGHT} ${qSize}px ${DISPLAY}`
      g.fillText('“', mx - qSize * 0.06, 8.5 * u + qSize * 0.72)
    })

    // halo (G) first, blurred; then the crisp strokes (R) on top
    g.globalCompositeOperation = 'lighter'
    g.shadowColor = 'rgb(0,255,0)'
    g.shadowBlur = 2.6 * u
    for (const op of ops) op('rgb(0,200,0)')
    g.shadowBlur = 0
    g.shadowColor = 'transparent'
    for (const op of ops) op('rgb(255,0,0)')
    g.globalCompositeOperation = 'source-over'
  }

  const items: Engraving[] = list.map((t, i) => {
    const tex = new THREE.DataTexture(new Uint8Array(W * H * 2), W, H, THREE.RGFormat, THREE.UnsignedByteType)
    tex.colorSpace = THREE.NoColorSpace
    tex.generateMipmaps = true
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.anisotropy = 8
    tex.unpackAlignment = 2
    // ~1.6 MB per plaque: don't keep it in JS memory once uploaded
    tex.onUpdate = () => {
      tex.image.data = null
    }
    const redraw = () => {
      if (!nameSize) measure()
      draw(t)
      const data = new Uint8Array(W * H * 2)
      const src = g.getImageData(0, 0, W, H).data
      // flip rows (v = 0 at the bottom) and bake the sandblast grain into R
      for (let y = 0; y < H; y++) {
        const sy = H - 1 - y
        for (let x = 0; x < W; x++) {
          const s = (sy * W + x) * 4
          const d = (y * W + x) * 2
          const r = src[s]
          const gr = grain[(sy * W + ((x + i * 97) % W))]
          data[d] = r ? Math.round(r * (0.58 + 0.42 * gr)) : 0
          data[d + 1] = src[s + 1]
        }
      }
      tex.image.data = data
      tex.needsUpdate = true
    }
    return { tex, redraw }
  })

  return { items, remeasure: measure }
}
