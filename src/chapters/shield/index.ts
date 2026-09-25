import * as THREE from 'three'
import type { CameraPose, Chapter, ChapterContext, Frame } from '../../core/types'
import { el, reveal, rise, setRise } from '../../core/dom'
import { clamp, ease, lerp, segment, smoothstep } from '../../core/math'
import { nextFrame } from '../../core/yield'
import { SECURITY, STATS } from '../../content'
import { G, polished } from '../../kit/glass'
import { buildWeb, webGeometry, webMaterial, type V2, type WebUniforms } from './web'
import { VEIL_GLSL, faceMaterial, plateTexture, type FaceUniforms } from './site'
import { HIDDEN, rimMaterial, slab } from './plate'
import './shield.css'

/*
 * LAMINATED — "Hacked? Breathe."
 *
 * "Your site" is a thick plate of laminated, sandblasted glass lit from
 * behind: a padlock and yoursite.com cut into it in polished clear letters,
 * a double hairline border, 24 hour ticks along its foot. Black all around.
 * Nothing slides in to save it: the plate heals itself, the way frost forms.
 *
 *   0.00–0.08  IN      the plate at rest, a cool backlight. The eyebrow and
 *                      "Hacked?" arrive from 0.06.
 *   0.08–0.30  IMPACT  a strike: a crisp shock ring, a crushed-white point,
 *                      and a spider-web fracture grows by scroll while red
 *                      light (the only red on the site) floods the plate and
 *                      leaks from every seam. The plate dips and HOLDS — the
 *                      laminate's interlayer glows red along its edge.
 *   0.30–0.37  HOLD    "Breathe." + the body settle over the broken plate
 *                      (the 0.35 landing: the whole story in one frame).
 *   0.37–0.50  FROST   the red drains to cool white; frost crystals grow off
 *                      the seams from the impact outward — red seams become
 *                      white crystalline ferns.
 *   0.45–0.56  BREATH  condensation creeps in from the plate's edges on a
 *                      feathered front and swallows the crystal web in a
 *                      soft, beaded veil.
 *   0.53–0.63  POLISH  a gliding highlight crosses the face (and runs along
 *                      the polished edge); behind it the veil is gone and
 *                      the sandblasted face is pristine, every cut razor sharp.
 *   0.62–0.95  STEADY  24/7 + its label + the emergency CTA (anchor 0.8); the
 *                      healed plate glows steady and cool while one hairline
 *                      of light crosses it, lighting the hour ticks it passes.
 *
 * Everything derives from `local` (no time-driven motion at all). Reduced
 * motion / Motion off: no dip, no shock ring, no pointer parallax.
 */

const W = 3.2
const H = 2.0
const RADIUS = 0.08
const DEPTH = 0.1
const BEVEL = 0.03
const FRONT = DEPTH / 2 + BEVEL
const IMPACT: V2 = [0.66, 0.2]
const STAT = STATS.find(s => s.value === '24/7') ?? STATS[STATS.length - 1]

const T = {
  strike: 0.08,
  red1: 0.19,
  grown: 0.26,
  /** copy: 'Breathe.' + body */
  breathe: 0.3,
  drain0: 0.37,
  drain1: 0.47,
  cryst0: 0.37,
  cryst1: 0.5,
  frost0: 0.45,
  frost1: 0.555,
  polish0: 0.53,
  polish1: 0.63,
  handoff: 0.62,
  scan0: 0.65,
  scan1: 0.93,
  out: 0.95,
}

const COOL = new THREE.Color(G.ice)
const RED = new THREE.Color(G.ember)
const WHITE = new THREE.Color(G.white)
/** the seams' core and the edge light, warmed by the hostile light */
const HOT = new THREE.Color('#ffd6cf')
const RIM_HOT = new THREE.Color('#ffc4bc')
const CRUSH_HOT = new THREE.Color('#ffd2cc')
const HEAD = new THREE.Color(1, 0.92, 0.88)

// ------------------------------------------------------------------ camera

interface Layout {
  w: number
  h: number
  top: number
  bottom: number
  gutter: number
  copyRight: number
  copyTop: number
  ok: boolean
}
interface Region {
  cx: number
  cy: number
  fw: number
  fh: number
}
interface Key {
  l: number
  yaw: number
  pitch: number
  fill: number
  /** subject centre offset (plate units) */
  s: [number, number, number]
}

const KEYS: Key[] = [
  { l: 0.0, yaw: -0.5, pitch: 0.08, fill: 0.84, s: [0, 0, 0] },
  { l: T.strike, yaw: -0.44, pitch: 0.07, fill: 0.88, s: [0.04, 0.02, 0] },
  // lean in toward the strike (a macro push), never across the copy; hold it through the landing
  { l: T.grown, yaw: -0.36, pitch: 0.06, fill: 1.0, s: [0.22, 0.06, 0] },
  { l: T.drain0, yaw: -0.38, pitch: 0.06, fill: 1.0, s: [0.2, 0.05, 0] },
  // ease back to the whole plate while it frosts over and is polished
  { l: 0.52, yaw: -0.46, pitch: 0.07, fill: 0.9, s: [0.04, 0.0, 0] },
  { l: 0.66, yaw: -0.4, pitch: 0.07, fill: 0.9, s: [0.0, 0.0, 0] },
  { l: 1.0, yaw: -0.3, pitch: 0.06, fill: 0.9, s: [0.0, 0.0, 0] },
]
const KEYS_TALL: Key[] = [
  { l: 0.0, yaw: -0.34, pitch: 0.07, fill: 0.9, s: [0, 0, 0] },
  { l: T.strike, yaw: -0.3, pitch: 0.06, fill: 0.92, s: [0.02, 0.02, 0] },
  { l: T.grown, yaw: -0.24, pitch: 0.05, fill: 1.0, s: [0.18, 0.06, 0] },
  { l: T.drain0, yaw: -0.26, pitch: 0.05, fill: 1.0, s: [0.16, 0.05, 0] },
  { l: 0.52, yaw: -0.32, pitch: 0.06, fill: 0.94, s: [0.03, 0, 0] },
  { l: 0.66, yaw: -0.28, pitch: 0.06, fill: 0.94, s: [0, 0, 0] },
  { l: 1.0, yaw: -0.2, pitch: 0.05, fill: 0.94, s: [0, 0, 0] },
]
/** the studio turn: strips glide along the polished edges (and ride the polish) */
const TURN: [number, number][] = [
  [0.0, 0.3],
  [T.strike, 0.15],
  [0.3, -0.1],
  [T.drain0, -0.05],
  [T.polish0, 0.2],
  [T.polish1, 1.2],
  [0.76, 0.95],
  [1.0, 0.8],
]
function envTurn(l: number) {
  for (let i = 0; i < TURN.length - 1; i++) {
    const [a, va] = TURN[i]
    const [b, vb] = TURN[i + 1]
    if (l <= b) return lerp(va, vb, ease.inOutCubic(segment(l, a, b)))
  }
  return TURN[TURN.length - 1][1]
}

const isTall = (frame: Frame) => frame.height > frame.width * 1.05
const inOutSine = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t)

function regionFor(L: Layout, frame: Frame, out: Region) {
  const w = L.ok ? L.w : frame.width
  const h = L.ok ? L.h : frame.height
  const tall = h > w * 1.05
  let x0 = L.gutter
  let x1 = w - L.gutter
  let y0 = L.top
  let y1 = h - L.bottom
  if (L.ok) {
    if (tall) y1 = Math.min(y1, L.copyTop - 18)
    else x0 = Math.max(x0, L.copyRight + 36)
  } else if (tall) y1 = h * 0.52
  else x0 = w * 0.42
  if (y1 - y0 < h * 0.22) y1 = y0 + h * 0.22
  if (x1 - x0 < w * 0.3) x0 = x1 - w * 0.3
  // the chrome sits in the top band: nudge the subject a touch lower on wide screens
  if (!tall) y0 += Math.min(20, h * 0.02)
  out.cx = (x0 + x1) / w - 1
  out.cy = 1 - (y0 + y1) / h
  out.fw = (x1 - x0) / w
  out.fh = (y1 - y0) / h
}

const _r: Region = { cx: 0, cy: 0, fw: 1, fh: 1 }
const _dir = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3()
const _Y = new THREE.Vector3(0, 1, 0)

function solvePose(l: number, frame: Frame, L: Layout, out: CameraPose): Region {
  const keys = isTall(frame) ? KEYS_TALL : KEYS
  let k = 0
  while (k < keys.length - 2 && l > keys[k + 1].l) k++
  const a = keys[k]
  const b = keys[k + 1]
  const t = ease.inOutCubic(segment(l, a.l, b.l))
  regionFor(L, frame, _r)
  const yaw = lerp(a.yaw, b.yaw, t)
  const pitch = lerp(a.pitch, b.pitch, t)
  const fill = lerp(a.fill, b.fill, t)
  const sx = lerp(a.s[0], b.s[0], t)
  const sy = lerp(a.s[1], b.s[1], t)
  const sz = lerp(a.s[2], b.s[2], t)
  const fov = isTall(frame) ? 34 : 28
  const aspect = frame.width / Math.max(1, frame.height)
  const tanV = Math.tan(THREE.MathUtils.degToRad(fov / 2))
  const tanX = tanV * aspect
  // the plate seen at an angle is narrower on screen: frame its projected width
  const sw = W * Math.cos(yaw) + (isTall(frame) ? 0.22 : 0.5)
  const sh = H + 0.34
  const D = Math.max(sw / (2 * tanX * _r.fw * fill), sh / (2 * tanV * _r.fh * fill))
  _dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
  _fwd.copy(_dir).negate()
  _right.crossVectors(_fwd, _Y).normalize()
  _up.crossVectors(_right, _fwd)
  out.position
    .set(sx, sy, sz)
    .addScaledVector(_dir, D)
    .addScaledVector(_right, -_r.cx * D * tanX)
    .addScaledVector(_up, -_r.cy * D * tanV)
  out.target.copy(out.position).addScaledVector(_fwd, D)
  out.fov = fov
  out.roll = 0
  out.parallax = frame.reducedMotion || frame.still ? 0 : 0.16
  return _r
}

// ------------------------------------------------------------------ chapter

export default function create(): Chapter {
  const group = new THREE.Group()
  /** the plate + its cracks (dips on the strike) */
  const plate = new THREE.Group()
  group.add(plate)

  let face: FaceUniforms | null = null
  let web: WebUniforms | null = null
  let rim: THREE.ShaderMaterial | null = null

  // DOM
  let copyA: HTMLElement
  let eyebrow: HTMLElement
  let line1: HTMLElement
  let line2: HTMLElement
  let panel: HTMLElement
  let copyB: HTMLElement
  let stat: HTMLElement
  let probe: HTMLElement

  const layout: Layout = { w: 1, h: 1, top: 90, bottom: 90, gutter: 32, copyRight: 0, copyTop: 0, ok: false }
  const scratch: CameraPose = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 30, roll: 0, parallax: 0 }
  const tmpC = new THREE.Color()

  function measure(stage: HTMLElement) {
    const cs = getComputedStyle(probe)
    layout.w = stage.clientWidth || window.innerWidth
    layout.h = stage.clientHeight || window.innerHeight
    layout.top = parseFloat(cs.paddingTop) || 90
    layout.bottom = parseFloat(cs.paddingBottom) || 90
    layout.gutter = parseFloat(cs.paddingLeft) || 32
    layout.copyRight = Math.max(copyA.offsetLeft + copyA.offsetWidth, copyB.offsetLeft + copyB.offsetWidth)
    layout.copyTop = Math.min(copyA.offsetTop, copyB.offsetTop)
    layout.ok = layout.w > 0 && layout.h > 0 && copyA.offsetWidth > 0
  }

  return {
    id: 'shield',
    group,
    anchors: [0.8],

    async init(ctx: ChapterContext) {
      const stage = ctx.stage
      const mobile = ctx.mobile

      // ---------------- DOM (the visual layer; the accessible copy is srContent)
      copyA = el('div', 'sh-a', undefined, stage)
      eyebrow = el('p', 'hud-eyebrow sh-eyebrow', SECURITY.eyebrow, copyA)
      const h = el('h2', 'hud-title sh-title', undefined, copyA)
      line1 = rise(el('span', 'sh-line', undefined, h), 'Hacked?')
      line2 = rise(el('span', 'sh-line', undefined, h), '<em>Breathe.</em>')
      panel = el('div', 'hud-panel hud-panel--strong sh-panel', undefined, copyA)
      el('p', 'hud-body', SECURITY.body, panel)

      copyB = el('div', 'sh-b', undefined, stage)
      stat = rise(el('p', 'hud-title sh-stat', undefined, copyB), STAT.value)
      el('p', 'hud-body sh-stat-label', STAT.label, copyB)
      const cta = el('a', 'hud-btn sh-cta', SECURITY.cta, copyB)
      cta.href = SECURITY.href

      probe = el('div', 'sh-probe', undefined, stage)
      reveal(copyA, 0)
      reveal(copyB, 0)
      reveal(panel, 0, 0)
      measure(stage)
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => measure(stage))
        ro.observe(stage)
        ro.observe(copyA)
        ro.observe(copyB)
      } else window.addEventListener('resize', () => measure(stage))

      // ---------------- the plate: sandblasted face (opaque) + polished sides (glass)
      const aniso = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy())
      const fm = faceMaterial(plateTexture(mobile, aniso), W, H)
      face = fm.u
      face.uImpact.value.set(IMPACT[0], IMPACT[1])
      const sides = polished({ thickness: 0.3 }).clone()
      const geo = slab(W, H, { radius: RADIUS, depth: DEPTH, bevel: BEVEL, segments: mobile ? 6 : 10 })
      const mesh = new THREE.Mesh(geo, [fm.mat, sides])
      mesh.renderOrder = 1
      rim = rimMaterial(DEPTH / 2)
      plate.add(mesh, new THREE.Mesh(geo, [HIDDEN, rim]))
      await nextFrame()

      // ---------------- the fracture and its crystals (opaque list, after the face)
      const lines = buildWeb({ w: W, h: H, impact: IMPACT, radials: mobile ? 10 : 12, seed: 11 })
      const wm = webMaterial(VEIL_GLSL, new THREE.Vector2(W / 2, H / 2))
      web = wm.u
      const cracks = new THREE.Mesh(webGeometry(lines.lines, FRONT + 0.003, { widthScale: mobile ? 1.35 : 1, reach: mobile ? 0.085 : 0.075 }), wm.mat)
      cracks.renderOrder = 2
      cracks.frustumCulled = false
      plate.add(cracks)
    },

    update(l: number, frame: Frame, ctx: ChapterContext) {
      const calm = ctx.reducedMotion || !!frame.still
      const wp = ctx.world.params
      const pp = ctx.post.params

      // ---------------- phases (all from local)
      const struck = l >= T.strike
      const redIn = smoothstep(T.strike, T.red1, l)
      const drain = smoothstep(T.drain0, T.drain1, l)
      const threat = redIn * (1 - drain)
      const cryst = segment(l, T.cryst0, T.cryst1)
      const front = inOutSine(segment(l, T.frost0, T.frost1))
      const pol = segment(l, T.polish0, T.polish1)
      const steady = smoothstep(T.handoff, T.scan0 + 0.02, l)
      const scanOn = steady * (1 - smoothstep(T.out, T.out + 0.03, l))

      // ---------------- camera region → where the backlight halo sits
      const reg = solvePose(l, frame, layout, scratch)
      const aspect = frame.width / Math.max(1, frame.height)
      wp.focus.set(reg.cx * aspect, reg.cy)
      wp.haloSize = clamp(reg.fh * 1.55, 0.8, 1.7)
      wp.halo = lerp(0.62, 0.85, threat)
      wp.haloColor = tmpC.copy(COOL).lerp(RED, threat)
      wp.slits = lerp(0.16, 0.06, threat)
      wp.slitAngle = 0
      wp.envTurn = envTurn(l) * (ctx.reducedMotion ? 0.4 : 1)
      wp.env = 1
      wp.keyDir.set(-0.5, 0.8, 0.55)
      wp.key = 1.5

      pp.vignette = 0.5
      pp.glitch = 0
      // no bloom: measured, it only softened the crush point (the plate reads crisper without it)
      pp.bloomStrength = 0

      // ---------------- the face: backlight, cuts, strike, heal, watch
      if (face) {
        const u = face
        u.uGlow.value = lerp(0.5, 0.54, threat)
        u.uGlowColor.value.copy(COOL).lerp(RED, threat * 0.92)
        u.uLipColor.value.copy(WHITE).lerp(RIM_HOT, threat * 0.6)
        u.uLight.value.set(-0.25, 0.2)
        // the shock ring runs out once across the plate (not under calm); the crush point stays until frosted over
        const ring = segment(l, T.strike, T.strike + 0.07)
        u.uRing.value.set(ease.outCubic(ring) * 2.6, struck && !calm ? (1 - ring) * 1.2 * Math.min(1, ring * 12) : 0)
        u.uCrush.value = 1.2 * smoothstep(T.strike, T.strike + 0.025, l)
        u.uCrushColor.value.copy(WHITE).lerp(CRUSH_HOT, threat * 0.5)
        u.uFront.value = l < T.frost0 ? -1 : lerp(-0.35, 1.3, front)
        u.uPolish.value = lerp(-2.3, 2.3, inOutSine(pol))
        u.uPolishK.value = Math.sin(Math.PI * pol) * (calm ? 0.28 : 0.5)
        u.uScan.value.set(lerp(-W / 2 - 0.15, W / 2 + 0.15, segment(l, T.scan0, T.scan1)), 0.55 * scanOn)
      }
      // the strike: the plate dips back and settles (scroll-driven; it holds)
      const hit = segment(l, T.strike, T.strike + 0.06)
      const dip = calm || !struck ? 0 : -0.07 * Math.sin(Math.PI * hit) * (1 - hit)
      plate.position.set(0, 0, dip)

      // ---------------- the fracture grows; crystals grow off it; the condensation swallows it
      if (web) {
        const u = web
        u.uGrow.value = struck ? ease.outQuad(segment(l, T.strike, T.grown)) * 1.08 + 0.004 : -1
        u.uHead.value = 1 - smoothstep(T.grown - 0.03, T.grown, l)
        u.uColor.value.copy(WHITE).lerp(HOT, threat * 0.6)
        u.uHot.value.copy(HEAD)
        u.uIntensity.value = lerp(1.2, 0.95, drain)
        u.uFlank.value.copy(RED)
        u.uFlankK.value = 0.45 * threat
        u.uCryst.value = l < T.cryst0 ? -1 : lerp(-0.05, 1.5, ease.inOutQuad(cryst))
        u.uCrystColor.value.copy(WHITE).lerp(COOL, 0.5)
        u.uFront.value = face ? face.uFront.value : -1
      }

      // ---------------- the polished edge: a razor line, the interlayer, the polish running along it
      if (rim) {
        const u = rim.uniforms
        u.uBase.value = lerp(0.5, 0.75, threat)
        ;(u.uColor.value as THREE.Color).copy(WHITE).lerp(RIM_HOT, threat * 0.7)
        ;(u.uFilmColor.value as THREE.Color).copy(COOL).lerp(RED, threat)
        u.uFilm.value = lerp(0.22, 0.6, threat)
        // two sweeps: the studio light greets the plate, then the polish runs the edge
        const sw0 = segment(l, 0.0, 0.2)
        const sw1 = segment(l, T.polish0, T.polish1 + 0.02)
        if (l < T.polish0) {
          u.uSweep.value = lerp(-2.6, 2.6, ease.inOutQuad(sw0))
          u.uBand.value = Math.sin(Math.PI * sw0) * 0.9
        } else {
          u.uSweep.value = lerp(-2.6, 2.6, inOutSine(sw1))
          u.uBand.value = Math.sin(Math.PI * sw1) * (calm ? 0.5 : 1.2)
        }
      }

      // ---------------- DOM
      const inA = smoothstep(0.055, 0.075, l) * (1 - smoothstep(T.handoff - 0.02, T.handoff, l))
      reveal(copyA, inA)
      setRise(line1, l > 0.058 && l < T.handoff)
      setRise(line2, l > T.breathe && l < T.handoff)
      reveal(panel, smoothstep(T.breathe, T.breathe + 0.03, l), 0)
      reveal(eyebrow, 1, 0)
      const inB = smoothstep(T.handoff - 0.004, T.handoff + 0.016, l) * (1 - smoothstep(T.out, T.out + 0.02, l))
      reveal(copyB, inB)
      setRise(stat, l > T.handoff - 0.002 && l < T.out + 0.01)
    },

    camera(l: number, frame: Frame, out: CameraPose) {
      solvePose(l, frame, layout, out)
    },
  }
}
