import * as THREE from 'three'
import '@fontsource/kalam/latin-300.css'
import { TESTIMONIALS } from '../../content'
import { rng } from '../../core/math'
import { nextFrame } from '../../core/yield'

/*
 * FINGER WRITING — each client's name (and company, smaller) as a fingertip
 * stroke that can be written into the fog stroke by stroke.
 *
 * The name is set in Kalam Light — a casual monoline hand — on a canvas,
 * thinned to a 1px skeleton (Zhang–Suen), and every skeleton pixel is given a
 * WRITE TIME: its geodesic distance along the stroke from where the finger
 * starts that glyph (Dijkstra over the skeleton), glyphs left to right with a
 * short pen lift in between (an i's dot comes after its stem). A
 * nearest-skeleton distance transform then spreads (distance, write time) to
 * every pixel. The fog shader clears a pixel when
 *   distance < fingertip radius   and   its write time < the finger's position
 * (plus a round cap), so the reveal travels ALONG the strokes like a finger.
 * The fingertip is wide (about a quarter of the cap height), as a real finger
 * dragged through condensation is.
 *
 * One half-float RGBA texture per voice (MW x MH):
 *   R = distance to the name's skeleton / fingertip radius   (cap 8)
 *   G = the name's write time 0..1
 *   B = distance to the company's skeleton / its radius       (cap 8)
 *   A = the company's write time 0..1
 * Row 0 is the bottom of the canvas (texture v up).
 *
 * Masks are built in phases (a generator): nameMask(i) runs one to completion
 * on the spot, buildMaskIdle(i) yields a frame between phases.
 */

export const MW = 1024
export const MH = 256
/** the hand: a casual monoline handwriting face (OFL, @fontsource/kalam) */
const HAND = '"Kalam", "Segoe Print", "Bradley Hand", cursive'
const HAND_WEIGHT = 300
/** the company: small tracked capitals, legible */
const FAMILY = '"Schibsted Grotesk Variable", "Schibsted Grotesk", system-ui, sans-serif'
const CO_WEIGHT = 540
/** name baseline / company baseline on the canvas (px from the top) */
const NAME_BASE = 142
const CO_BASE = 238
const CAP = 8
/** fingertip radius / name size */
const FINGER = 0.085

export interface NameMask {
  tex: THREE.DataTexture
  /** fingertip radius / total stroke length (write-time units): the round cap */
  capName: number
  capCo: number
  /** fingertip radius in mask px */
  radius: number
  /**
   * drip starts: mask uv (v up) at the bottom edge of a stroke, the write time
   * it is reached, and how far it may run (mask v units) before the company line
   */
  drips: { u: number; v: number; t: number; max: number }[]
}

let fontsPromise: Promise<boolean> | null = null

/**
 * Start loading the hand (and the company face) now; resolves true once both
 * are ready. Called at module load so the download overlaps the other
 * chapters' init.
 */
export function preloadScriptFonts(): Promise<boolean> {
  if (fontsPromise) return fontsPromise
  if (typeof document === 'undefined' || !document.fonts?.load) return (fontsPromise = Promise.resolve(false))
  fontsPromise = Promise.all([
    document.fonts.load(`${HAND_WEIGHT} 100px ${HAND}`, 'Aa'),
    document.fonts.load(`${CO_WEIGHT} 30px ${FAMILY}`, 'AB'),
  ]).then(
    faces => faces.every(f => f.length > 0),
    () => false,
  )
  return fontsPromise
}

/** wait up to `ms` for the hand; false if it is not there (yet) */
export async function scriptFontsReady(ms = 2500): Promise<boolean> {
  let timer = 0
  const timeout = new Promise<boolean>(r => {
    timer = window.setTimeout(() => r(false), ms)
  })
  const ok = await Promise.race([preloadScriptFonts(), timeout])
  clearTimeout(timer)
  return ok
}

let canvas: HTMLCanvasElement | null = null
let ctx2d: CanvasRenderingContext2D | null = null
let nameSize = 0

function context() {
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.width = MW
    canvas.height = MH
    ctx2d = canvas.getContext('2d', { willReadFrequently: true })
  }
  return ctx2d!
}

/** one size for every name (the longest fits), so the hand never changes scale */
function fitNameSize(g: CanvasRenderingContext2D) {
  if (nameSize) return nameSize
  g.font = `${HAND_WEIGHT} 100px ${HAND}`
  let widest = 1
  for (const t of TESTIMONIALS) widest = Math.max(widest, g.measureText(t.name).width)
  nameSize = Math.min(126, ((MW * 0.88) / widest) * 100)
  return nameSize
}

function drawName(g: CanvasRenderingContext2D, text: string, size: number) {
  g.clearRect(0, 0, MW, MH)
  g.fillStyle = '#fff'
  g.textBaseline = 'alphabetic'
  g.textAlign = 'center'
  g.font = `${HAND_WEIGHT} ${size}px ${HAND}`
  g.fillText(text, MW / 2, NAME_BASE)
}

function drawCompany(g: CanvasRenderingContext2D, text: string) {
  g.clearRect(0, 0, MW, MH)
  g.fillStyle = '#fff'
  g.textBaseline = 'alphabetic'
  g.textAlign = 'left'
  const up = text.toUpperCase()
  let size = 25
  let track = 0.2 * size
  const measure = () => {
    g.font = `${CO_WEIGHT} ${size}px ${FAMILY}`
    let w = 0
    for (const ch of up) w += g.measureText(ch).width
    return w + track * (up.length - 1)
  }
  let w = measure()
  if (w > MW * 0.9) {
    size *= (MW * 0.9) / w
    track = 0.2 * size
    w = measure()
  }
  let x = MW / 2 - w / 2
  for (const ch of up) {
    g.fillText(ch, x, CO_BASE)
    x += g.measureText(ch).width + track
  }
}

/** binary image from the canvas alpha */
function binarize(g: CanvasRenderingContext2D, soften = 0): Uint8Array {
  const src = g.getImageData(0, 0, MW, MH).data
  const out = new Uint8Array(MW * MH)
  if (soften > 0) {
    // round the square stroke ends first (a separable box blur of the ink
    // rows, thresholded at half): thinning then runs straight into each end
    // instead of hooking into a corner (an I would read as a 1)
    let y0 = MH
    let y1 = -1
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        if (src[(y * MW + x) * 4 + 3]) {
          if (y < y0) y0 = y
          y1 = y
          break
        }
      }
    }
    if (y1 < 0) return out
    y0 = Math.max(1, y0 - 2)
    y1 = Math.min(MH - 2, y1 + 2)
    const a = new Float32Array(MW * MH)
    const b = new Float32Array(MW * MH)
    for (let y = y0; y <= y1; y++) for (let x = 0; x < MW; x++) a[y * MW + x] = src[(y * MW + x) * 4 + 3]
    for (let pass = 0; pass < soften; pass++) {
      for (let y = y0; y <= y1; y++) for (let x = 1; x < MW - 1; x++) { const i = y * MW + x; b[i] = (a[i - 1] + a[i] + a[i + 1]) / 3 }
      for (let y = y0; y <= y1; y++) for (let x = 1; x < MW - 1; x++) { const i = y * MW + x; a[i] = (b[i - MW] + b[i] + b[i + MW]) / 3 }
    }
    for (let i = 0; i < out.length; i++) out[i] = a[i] > 128 ? 1 : 0
  } else {
    for (let i = 0; i < out.length; i++) out[i] = src[i * 4 + 3] > 110 ? 1 : 0
  }
  // the border must stay empty for the 3x3 neighbourhoods below
  for (let x = 0; x < MW; x++) out[x] = out[(MH - 1) * MW + x] = 0
  for (let y = 0; y < MH; y++) out[y * MW] = out[y * MW + MW - 1] = 0
  return out
}

/** Zhang–Suen thinning in place (1 = ink), iterating only over live pixels */
function thin(img: Uint8Array, w: number) {
  let list: number[] = []
  for (let i = 0; i < img.length; i++) if (img[i]) list.push(i)
  const del: number[] = []
  for (let guard = 0; guard < 64; guard++) {
    let changed = false
    for (let pass = 0; pass < 2; pass++) {
      del.length = 0
      for (const i of list) {
        if (!img[i]) continue
        const p2 = img[i - w], p3 = img[i - w + 1], p4 = img[i + 1], p5 = img[i + w + 1]
        const p6 = img[i + w], p7 = img[i + w - 1], p8 = img[i - 1], p9 = img[i - w - 1]
        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
        if (b < 2 || b > 6) continue
        const a =
          (p2 === 0 && p3 === 1 ? 1 : 0) + (p3 === 0 && p4 === 1 ? 1 : 0) + (p4 === 0 && p5 === 1 ? 1 : 0) + (p5 === 0 && p6 === 1 ? 1 : 0) +
          (p6 === 0 && p7 === 1 ? 1 : 0) + (p7 === 0 && p8 === 1 ? 1 : 0) + (p8 === 0 && p9 === 1 ? 1 : 0) + (p9 === 0 && p2 === 1 ? 1 : 0)
        if (a !== 1) continue
        if (pass === 0) {
          if (p2 * p4 * p6 || p4 * p6 * p8) continue
        } else if (p2 * p4 * p8 || p2 * p6 * p8) continue
        del.push(i)
      }
      for (const i of del) img[i] = 0
      if (del.length) changed = true
    }
    list = list.filter(i => img[i])
    if (!changed) break
  }
  return list
}

/** tiny binary min-heap keyed by float priority */
class Heap {
  private ids: number[] = []
  private keys: number[] = []
  get size() {
    return this.ids.length
  }
  push(id: number, key: number) {
    const ids = this.ids, keys = this.keys
    let i = ids.length
    ids.push(id)
    keys.push(key)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (keys[p] <= key) break
      ids[i] = ids[p]
      keys[i] = keys[p]
      i = p
    }
    ids[i] = id
    keys[i] = key
  }
  pop(): number {
    const ids = this.ids, keys = this.keys
    const top = ids[0]
    const lastId = ids.pop()!
    const lastKey = keys.pop()!
    const n = ids.length
    if (n) {
      let i = 0
      for (;;) {
        let c = 2 * i + 1
        if (c >= n) break
        if (c + 1 < n && keys[c + 1] < keys[c]) c++
        if (keys[c] >= lastKey) break
        ids[i] = ids[c]
        keys[i] = keys[c]
        i = c
      }
      ids[i] = lastId
      keys[i] = lastKey
    }
    return top
  }
}

const N8 = (w: number) => [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1]
const W8 = [Math.SQRT2, 1, Math.SQRT2, 1, 1, Math.SQRT2, 1, Math.SQRT2]

interface Stroke {
  /** write time per skeleton pixel (index → 0..1), filled for skeleton pixels only */
  time: Float32Array
  skel: Uint8Array
  pixels: number[]
  total: number
  /** components in writing order, each with its pixels */
  comps: number[][]
}

/** order the skeleton for writing: glyph by glyph (left → right), along each stroke */
function order(skel: Uint8Array, pixels: number[], w: number, penLift: number): Stroke {
  const n8 = N8(w)
  const label = new Int32Array(skel.length).fill(-1)
  const comps: number[][] = []
  for (const s of pixels) {
    if (label[s] >= 0) continue
    const id = comps.length
    const comp: number[] = [s]
    label[s] = id
    for (let k = 0; k < comp.length; k++) {
      const i = comp[k]
      for (const d of n8) {
        const j = i + d
        if (skel[j] && label[j] < 0) {
          label[j] = id
          comp.push(j)
        }
      }
    }
    comps.push(comp)
  }
  const key = (i: number) => (i % w) + 0.35 * ((i / w) | 0)
  // left to right; a small mark (an i's dot) is written right after the
  // glyph it sits over, as a hand does
  const box = new Map<number[], [number, number]>()
  for (const c of comps) {
    let x0 = Infinity
    let x1 = -Infinity
    for (const i of c) {
      const x = i % w
      if (x < x0) x0 = x
      if (x > x1) x1 = x
    }
    box.set(c, [x0, x1])
  }
  comps.sort((a, b) => box.get(a)![0] - box.get(b)![0])
  const sizes = comps.map(c => c.length).sort((a, b) => a - b)
  const small = Math.max(4, sizes[sizes.length >> 1] * 0.3)
  const big = comps.filter(c => c.length > small)
  const marks = comps.filter(c => c.length <= small)
  for (const mk of marks) {
    const [m0, m1] = box.get(mk)!
    let host: number[] | null = null
    let best = 0
    for (const c of big) {
      const [c0, c1] = box.get(c)!
      const ov = Math.min(m1, c1) - Math.max(m0, c0)
      if (ov > best) {
        best = ov
        host = c
      }
    }
    if (host) {
      big.splice(big.indexOf(host) + 1, 0, mk)
    } else {
      let at = big.length
      for (let k = 0; k < big.length; k++) if (box.get(big[k])![0] > m0) { at = k; break }
      big.splice(at, 0, mk)
    }
  }
  comps.length = 0
  comps.push(...big)
  const dist = new Float32Array(skel.length).fill(Infinity)
  const time = new Float32Array(skel.length)
  let offset = 0
  const heap = new Heap()
  for (const comp of comps) {
    // the finger starts each glyph at its top-left-most point
    let start = comp[0]
    for (const i of comp) if (key(i) < key(start)) start = i
    dist[start] = 0
    heap.push(start, 0)
    while (heap.size) {
      const i = heap.pop()
      const d = dist[i]
      for (let k = 0; k < 8; k++) {
        const j = i + n8[k]
        if (!skel[j]) continue
        const nd = d + W8[k]
        if (nd < dist[j]) {
          dist[j] = nd
          heap.push(j, nd)
        }
      }
    }
    let len = 0
    for (const i of comp) {
      time[i] = offset + dist[i]
      len = Math.max(len, dist[i])
    }
    offset += len + penLift
  }
  const total = Math.max(1, offset - penLift)
  for (const i of pixels) time[i] = Math.min(1, time[i] / total)
  return { time, skel, pixels, total, comps }
}

interface Nearest {
  near: Int32Array
  d2: Float32Array
  box: readonly [number, number, number, number]
}

/**
 * Nearest-skeleton transform (two-pass propagation of the nearest point):
 * for every pixel, the index of the nearest skeleton pixel and its distance².
 * Restricted to the skeleton's bounding box + margin. Yields after each sweep.
 */
function* nearest(stroke: Stroke, w: number, h: number, margin: number): Generator<void, Nearest, void> {
  const near = new Int32Array(w * h).fill(-1)
  const d2 = new Float32Array(w * h).fill(Infinity)
  let x0 = w, y0 = h, x1 = 0, y1 = 0
  for (const i of stroke.pixels) {
    const x = i % w, y = (i / w) | 0
    near[i] = i
    d2[i] = 0
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  x0 = Math.max(1, x0 - margin)
  y0 = Math.max(1, y0 - margin)
  x1 = Math.min(w - 2, x1 + margin)
  y1 = Math.min(h - 2, y1 + margin)
  const test = (i: number, x: number, y: number, j: number) => {
    const n = near[j]
    if (n < 0) return
    const dx = (n % w) - x, dy = ((n / w) | 0) - y
    const dd = dx * dx + dy * dy
    if (dd < d2[i]) {
      d2[i] = dd
      near[i] = n
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x
        test(i, x, y, i - 1)
        test(i, x, y, i - w - 1)
        test(i, x, y, i - w)
        test(i, x, y, i - w + 1)
      }
      for (let x = x1; x >= x0; x--) {
        const i = y * w + x
        test(i, x, y, i + 1)
      }
    }
    yield
    for (let y = y1; y >= y0; y--) {
      for (let x = x1; x >= x0; x--) {
        const i = y * w + x
        test(i, x, y, i + 1)
        test(i, x, y, i + w + 1)
        test(i, x, y, i + w)
        test(i, x, y, i + w - 1)
      }
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x
        test(i, x, y, i - 1)
      }
    }
    yield
  }
  return { near, d2, box: [x0, y0, x1, y1] as const }
}

const cache = new Map<number, NameMask>()
const pending = new Map<number, Generator<void, NameMask, void>>()

/** the mask for testimonial i, in phases (each a few ms; yields between) */
function* build(i: number): Generator<void, NameMask, void> {
  const t = TESTIMONIALS[i]
  const g = context()
  const size = fitNameSize(g)
  const rName = size * FINGER
  const rCo = 1.9
  yield

  // draw + read back in one phase: the canvas is shared between builds
  drawName(g, t.name, size)
  const nameImg = binarize(g)
  yield
  const namePx = thin(nameImg, MW)
  yield
  const name = order(nameImg, namePx, MW, rName * 3)
  yield
  const nn = yield* nearest(name, MW, MH, Math.ceil(rName * 2.4) + 2)

  drawCompany(g, t.company)
  const coImg = binarize(g, 2)
  const coPx = thin(coImg, MW)
  const co = order(coImg, coPx, MW, rCo * 4)
  const cn = yield* nearest(co, MW, MH, Math.ceil(rCo * 3) + 2)

  const toHalf = THREE.DataUtils.toHalfFloat
  const H_CAP = toHalf(CAP)
  const H_ONE = toHalf(1)
  const data = new Uint16Array(MW * MH * 4)
  for (let k = 0; k < MW * MH; k++) {
    data[k * 4] = H_CAP
    data[k * 4 + 1] = H_ONE
    data[k * 4 + 2] = H_CAP
    data[k * 4 + 3] = H_ONE
  }
  const fill = (res: Nearest, st: Stroke, r: number, ch: number) => {
    const [x0, y0, x1, y1] = res.box
    for (let y = y0; y <= y1; y++) {
      const row = (MH - 1 - y) * MW
      for (let x = x0; x <= x1; x++) {
        const i = y * MW + x
        const n = res.near[i]
        if (n < 0) continue
        const o = (row + x) * 4 + ch
        data[o] = toHalf(Math.min(CAP, Math.sqrt(res.d2[i]) / r))
        data[o + 1] = toHalf(st.time[n])
      }
    }
  }
  fill(nn, name, rName, 0)
  yield
  fill(cn, co, rCo, 2)

  // drips: from the lowest points of a couple of glyphs on the baseline; one
  // above the company line stops short of it
  let cx0 = MW, cx1 = 0, cTop = MH
  for (const p of co.pixels) {
    const x = p % MW
    cx0 = Math.min(cx0, x)
    cx1 = Math.max(cx1, x)
    cTop = Math.min(cTop, (p / MW) | 0)
  }
  const drips: NameMask['drips'] = []
  const rand = rng(101 + i * 17)
  // candidates: glyphs whose lowest point sits on the baseline (not a raised
  // stroke end, a dot or a descender)
  const feet: number[] = []
  for (const comp of name.comps) {
    let low = comp[0]
    for (const p of comp) if (((p / MW) | 0) > ((low / MW) | 0)) low = p
    const y = (low / MW) | 0
    if (y >= NAME_BASE - size * 0.1 && y <= NAME_BASE + size * 0.06) feet.push(low)
  }
  const picks = feet.length > 3 ? [feet[Math.floor(feet.length * (0.18 + rand() * 0.16))], feet[Math.floor(feet.length * (0.62 + rand() * 0.18))]] : feet.slice(0, 1)
  for (const low of picks) {
    const x = low % MW
    const y = (low / MW) | 0
    // the drip leaves from inside the stroke's lower edge
    const y0 = y + rName * 0.55
    const over = x > cx0 - rName * 3 && x < cx1 + rName * 3
    const max = over ? Math.max(0, cTop - rCo * 3 - 8 - y0) / MH : 0.9
    drips.push({ u: x / MW, v: 1 - y0 / MH, t: name.time[low], max })
  }

  const tex = new THREE.DataTexture(data, MW, MH, THREE.RGBAFormat, THREE.HalfFloatType)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return { tex, capName: rName / name.total, capCo: rCo / co.total, radius: rName, drips }
}

function step(i: number): NameMask | null {
  let it = pending.get(i)
  if (!it) {
    it = build(i)
    pending.set(i, it)
  }
  const r = it.next()
  if (!r.done) return null
  pending.delete(i)
  cache.set(i, r.value)
  return r.value
}

/** the finger-writing mask for testimonial i, built now if it isn't yet (~20–40 ms) */
export function nameMask(i: number): NameMask {
  let m = cache.get(i)
  while (!m) m = step(i) ?? undefined
  return m
}

/** is testimonial i's mask ready? */
export const hasMask = (i: number) => cache.has(i)

/** build testimonial i's mask a phase per frame (a no-op once it's built) */
export async function buildMaskIdle(i: number) {
  while (!cache.has(i)) {
    if (step(i)) return
    await nextFrame()
  }
}

/**
 * Forget cached masks (the hand arrived after a fallback build). Returns the
 * old textures: dispose them once nothing samples them any more.
 */
export function resetMasks(): THREE.Texture[] {
  const old = [...cache.values()].map(m => m.tex)
  cache.clear()
  pending.clear()
  nameSize = 0
  return old
}
