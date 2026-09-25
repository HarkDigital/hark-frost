import * as THREE from 'three'
import type { CameraPose, Chapter, ChapterContext, Frame } from '../../core/types'
import { el, reveal, rise, setRise } from '../../core/dom'
import { clamp, ease, lerp, segment, smoothstep } from '../../core/math'
import { nextFrame } from '../../core/yield'
import { SECURITY, STATS } from '../../content'
import { G, polished } from '../../kit/glass'
import { buildWeb, webGeometry, webMaterial, type V2 } from './web'
import { faceMaterial, siteTexture, type FaceUniforms } from './site'
import { HIDDEN, laminateMaterials, rimMaterial, slab, type LaminateUniforms } from './laminate'
import './shield.css'

/*
 * LAMINATED — "Hacked? Breathe."
 *
 * "Your site" is a pane of frosted glass lit from behind like a light box,
 * a minimal website cut into it as clear grooves. Black all around.
 *
 *   0.00–0.08  IN      the pane at rest, a cool backlight (the cut clears).
 *                      The eyebrow and "Hacked?" arrive from 0.06.
 *   0.08–0.30  IMPACT  the backlight turns a hostile red (the only red on the
 *                      site); a strike: a crisp shock ring, a crushed-white
 *                      point, and a spider-web fracture grows by scroll —
 *                      radials, concentric rings, forks. The pane dips and
 *                      HOLDS: laminated glass doesn't fall apart.
 *   0.30–0.60  BREATHE "Breathe." + the body in a frosted panel (settled at
 *                      the 0.45 landing). The red drains to cool white; the
 *                      cracks heal from the edges inward; a second, thicker
 *                      frosted pane — the new laminate — slides in front, its
 *                      polished edges catching a sweep of the studio lights.
 *   0.56–0.68  THAW    the laminate's centre thaws to clear (a sandblasted
 *                      border stays frosted, a small Hark mark etched in its
 *                      corner): the healed site, crisp, behind new glass.
 *   0.58–0.95  STEADY  24/7 + its label + the emergency CTA (anchor 0.8); a
 *                      very slow breathing backlight — monitoring, never a flash.
 *
 * Everything derives from `local`; frame.time only drives idle drift and the
 * breathing light (both off / frozen under reduced motion or Motion off).
 */

const W = 3.2
const H = 2.0
const RADIUS = 0.07
const SITE_DEPTH = 0.07
const SITE_BEVEL = 0.022
const FRONT = SITE_DEPTH / 2 + SITE_BEVEL
const LAM_DEPTH = 0.15
const LAM_BEVEL = 0.034
const LAM_GAP = 0.05
const LAM_Z = FRONT + LAM_GAP + LAM_DEPTH / 2 + LAM_BEVEL
const IMPACT: V2 = [0.66, 0.2]
const STAT = STATS.find(s => s.value === '24/7') ?? STATS[STATS.length - 1]

const T = {
  strike: 0.08,
  grown: 0.26,
  /** copy: 'Breathe.' + body */
  breathe: 0.3,
  drain0: 0.3,
  drain1: 0.42,
  heal0: 0.31,
  heal1: 0.46,
  slide0: 0.33,
  slide1: 0.53,
  thaw0: 0.55,
  thaw1: 0.68,
  handoff: 0.58,
  out: 0.95,
}

const COOL = new THREE.Color(G.ice)
const RED = new THREE.Color(G.ember)
const WHITE = new THREE.Color(G.white)

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
  /** subject centre offset (pane units) */
  s: [number, number, number]
}

const KEYS: Key[] = [
  { l: 0.0, yaw: -0.5, pitch: 0.08, fill: 0.84, s: [0, 0, 0] },
  { l: T.strike, yaw: -0.44, pitch: 0.07, fill: 0.88, s: [0.04, 0.02, 0] },
  // lean in toward the strike (a macro push), never across the copy
  { l: T.grown, yaw: -0.36, pitch: 0.06, fill: 1.0, s: [0.22, 0.06, 0] },
  { l: 0.4, yaw: -0.46, pitch: 0.07, fill: 0.9, s: [0.05, 0.0, 0.1] },
  { l: 0.62, yaw: -0.4, pitch: 0.07, fill: 0.9, s: [0.0, 0.0, 0.12] },
  { l: 1.0, yaw: -0.3, pitch: 0.06, fill: 0.9, s: [0.0, 0.0, 0.12] },
]
const KEYS_TALL: Key[] = [
  { l: 0.0, yaw: -0.34, pitch: 0.07, fill: 0.9, s: [0, 0, 0] },
  { l: T.strike, yaw: -0.3, pitch: 0.06, fill: 0.92, s: [0.02, 0.02, 0] },
  { l: T.grown, yaw: -0.24, pitch: 0.05, fill: 1.0, s: [0.18, 0.06, 0] },
  { l: 0.4, yaw: -0.32, pitch: 0.06, fill: 0.94, s: [0.04, 0, 0.1] },
  { l: 0.62, yaw: -0.28, pitch: 0.06, fill: 0.94, s: [0, 0, 0.12] },
  { l: 1.0, yaw: -0.2, pitch: 0.05, fill: 0.94, s: [0, 0, 0.12] },
]
/** the studio turn: strips glide along the polished edges */
const TURN: [number, number][] = [
  [0.0, 0.3],
  [T.strike, 0.15],
  [0.3, -0.1],
  [0.36, 0.2],
  [0.56, 1.25],
  [0.7, 0.9],
  [1.0, 0.75],
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
  // the pane seen at an angle is narrower on screen: frame its projected width
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
  out.parallax = 0.16
  return _r
}

// ------------------------------------------------------------------ chapter

export default function create(): Chapter {
  const group = new THREE.Group()
  /** the site pane + its cracks (dips on the strike) */
  const site = new THREE.Group()
  /** the new laminate (slides in) */
  const lam = new THREE.Group()
  lam.visible = false
  group.add(site, lam)

  let face: FaceUniforms | null = null
  let lamU: LaminateUniforms | null = null
  let webMat: THREE.ShaderMaterial | null = null
  let siteRim: THREE.ShaderMaterial | null = null
  let lamRim: THREE.ShaderMaterial | null = null

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
  const tmpC2 = new THREE.Color()

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

      // ---------------- the site pane: frosted face (opaque) + polished sides (glass)
      const aniso = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy())
      const tex = siteTexture(mobile, aniso)
      const fm = faceMaterial(tex, W, H)
      face = fm.u
      face.uImpact.value.set(IMPACT[0], IMPACT[1])
      const siteSides = polished({ thickness: 0.3 }).clone()
      const siteGeo = slab(W, H, { radius: RADIUS, depth: SITE_DEPTH, bevel: SITE_BEVEL, segments: mobile ? 5 : 8 })
      const siteMesh = new THREE.Mesh(siteGeo, [fm.mat, siteSides])
      siteMesh.renderOrder = 1
      siteRim = rimMaterial()
      site.add(siteMesh, new THREE.Mesh(siteGeo, [HIDDEN, siteRim]))
      await nextFrame()

      // ---------------- the fracture (opaque list, after the face)
      const web = buildWeb({ w: W, h: H, impact: IMPACT, radials: mobile ? 10 : 12, seed: 11 })
      webMat = webMaterial()
      const cracks = new THREE.Mesh(webGeometry(web.lines, FRONT + 0.003, mobile ? 1.35 : 1), webMat)
      cracks.renderOrder = 2
      cracks.frustumCulled = false
      site.add(cracks)
      await nextFrame()

      // ---------------- the new laminate: thicker, frosted border, thawing window
      const lm = laminateMaterials(W, H, LAM_DEPTH)
      lamU = lm.u
      const lamGeo = slab(W, H, { radius: RADIUS, depth: LAM_DEPTH, bevel: LAM_BEVEL, segments: mobile ? 6 : 10 })
      const lamMesh = new THREE.Mesh(lamGeo, [lm.caps, lm.sides])
      lamRim = rimMaterial()
      lam.add(lamMesh, new THREE.Mesh(lamGeo, [HIDDEN, lamRim]))
      lam.position.set(W * 1.4, 0, LAM_Z)
    },

    update(l: number, frame: Frame, ctx: ChapterContext) {
      const rm = ctx.reducedMotion
      const t = frame.time
      const calm = rm || !!frame.still
      const wp = ctx.world.params
      const pp = ctx.post.params

      // ---------------- phases
      const struck = l >= T.strike
      const redIn = smoothstep(T.strike - 0.004, T.strike + 0.03, l)
      const drain = smoothstep(T.drain0, T.drain1, l)
      const threat = redIn * (1 - drain)
      const slide = ease.outCubic(segment(l, T.slide0, T.slide1))
      const thaw = ease.inOutCubic(segment(l, T.thaw0, T.thaw1))
      const steady = smoothstep(0.58, 0.7, l)
      // a very slow breath of light (≈ 7 s), only in the steady state
      const breath = rm ? 0 : Math.sin((t * Math.PI * 2) / 7) * steady

      // ---------------- camera region → where the backlight halo sits
      const reg = solvePose(l, frame, layout, scratch)
      const aspect = frame.width / Math.max(1, frame.height)
      wp.focus.set(reg.cx * aspect, reg.cy)
      wp.haloSize = clamp(reg.fh * 1.55, 0.8, 1.7)
      wp.halo = lerp(0.62, 0.85, threat) + 0.1 * breath
      wp.haloColor = tmpC.copy(COOL).lerp(RED, threat)
      wp.slits = lerp(0.16, 0.06, threat)
      wp.slitAngle = 0
      wp.envTurn = envTurn(l) * (rm ? 0.4 : 1)
      wp.env = 1
      wp.keyDir.set(-0.5, 0.8, 0.55)
      wp.key = 1.5

      pp.vignette = 0.5
      pp.bloomStrength = 0.3
      pp.glitch = rm ? 0 : 0.05 * Math.sin(Math.PI * segment(l, T.strike, T.strike + 0.05))

      // ---------------- the site pane: backlight, etch, strike
      if (face) {
        const u = face
        const glow = lerp(0.44, 0.5, threat) * (1 + 0.08 * breath)
        u.uGlow.value = glow
        u.uGlowColor.value.copy(COOL).lerp(RED, threat * 0.92)
        u.uLipColor.value.copy(WHITE).lerp(tmpC2.set('#ffb3a8'), threat * 0.6)
        u.uLight.value.set(-0.25 + 0.06 * Math.sin(t * 0.13) * (calm ? 0 : 1), 0.2)
        // the shock ring runs out once across the pane; the crush point stays until healed
        const ring = segment(l, T.strike, T.strike + 0.07)
        u.uRing.value.set(ease.outCubic(ring) * 2.6, struck ? (1 - ring) * 1.4 * Math.min(1, ring * 12) : 0)
        const healed = smoothstep(T.heal0 + 0.08, T.heal1, l)
        u.uCrush.value = struck ? 1.2 * (1 - healed) : 0
        u.uCrushColor.value.copy(WHITE).lerp(tmpC2.set('#ffd2cc'), threat * 0.5)
      }
      // the strike: the pane dips back and settles (scroll-driven, it holds)
      const hit = segment(l, T.strike, T.strike + 0.06)
      const dip = rm ? 0 : -0.07 * Math.sin(Math.PI * hit) * (1 - hit) * (struck ? 1 : 0)
      site.position.set(0, calm ? 0 : 0.018 * Math.sin(t * 0.5), dip)
      site.rotation.set(calm ? 0 : 0.01 * Math.sin(t * 0.31), calm ? 0 : 0.016 * Math.sin(t * 0.23), 0)

      // ---------------- the fracture: grows, then heals from the edges inward
      if (webMat) {
        const u = webMat.uniforms
        u.uGrow.value = struck ? ease.outQuad(segment(l, T.strike, T.grown)) * 1.08 + 0.004 : -1
        u.uHeal.value = lerp(1.2, -0.05, ease.inOutQuad(segment(l, T.heal0, T.heal1)))
        u.uHead.value = 1 - smoothstep(T.grown - 0.03, T.grown, l)
        ;(u.uColor.value as THREE.Color).copy(WHITE).lerp(tmpC2.set('#ffe1dc'), threat * 0.5)
        ;(u.uHot.value as THREE.Color).set(1, 0.92, 0.88)
        u.uIntensity.value = lerp(1.25, 0.9, drain)
      }

      // ---------------- the new laminate: slides in, thaws
      lam.visible = l > T.slide0 - 0.005
      lam.position.set(lerp(W * 1.45, 0, slide), site.position.y, LAM_Z + lerp(0.25, 0, slide))
      lam.rotation.set(site.rotation.x, lerp(-0.12, 0, slide) + site.rotation.y, 0)
      if (lamU) {
        // the thaw front descends from above the pane and settles low
        lamU.uFront.value = lerp(H * 0.5 + 0.45, -0.42, thaw)
        lamU.uFrostGlow.value.copy(COOL).multiplyScalar(0.085 * (1 + 0.1 * breath))
      }
      // polished edges: a razor line always; a light sweep glides along them as the laminate arrives
      if (siteRim) {
        const u = siteRim.uniforms
        u.uBase.value = lerp(0.5, 0.75, threat) * (1 - 0.5 * slide)
        ;(u.uColor.value as THREE.Color).copy(WHITE).lerp(tmpC2.set('#ffc4bc'), threat * 0.7)
        const sw = segment(l, 0.0, 0.2)
        u.uSweep.value = lerp(-2.6, 2.6, ease.inOutQuad(sw))
        u.uBand.value = Math.sin(Math.PI * sw) * 0.9
      }
      if (lamRim) {
        const u = lamRim.uniforms
        u.uBase.value = 0.9 * (1 + 0.1 * breath)
        const sw = segment(l, 0.4, 0.66)
        u.uSweep.value = lerp(-2.6, 2.6, ease.inOutQuad(sw))
        u.uBand.value = Math.sin(Math.PI * sw) * (rm ? 0.5 : 1.3)
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
