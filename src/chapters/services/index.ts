import * as THREE from 'three'
import type { CameraPose, Chapter, ChapterContext, Frame } from '../../core/types'
import { clamp, damp, lerp, smoothstep } from '../../core/math'
import { nextFrame } from '../../core/yield'
import { N, TILE_H, TILE_W, buildDeck, type Deck } from './deck'
import { Hud, type HudMetrics } from './hud'
import './services.css'

/*
 * SERVICES — "Etched".
 *
 * Eleven thick sandblasted glass plates hang as a column of louvres in a
 * black gallery; each carries its service in REVERSE ETCHING (the icon, the
 * number and the name are clear lines in the frosted face, backlit, razor
 * sharp). Scroll runs the column slowly upward: the plate in view slides
 * forward out of the louvres and turns to face you, its frost thaws a touch
 * and its backlight swells; its neighbours part, the rest fade into black.
 *
 *   0.00–0.08  intro: the louvres open out of hairlines (under the breath
 *              cut), the whole column hangs in its backlight; the camera
 *              drifts in. "Eleven ways to be heard." (settled 0.06 & 0.08)
 *   0.08–0.92  eleven plates (~0.076 each): part → turn → settle → hold
 *   0.92–1.00  the last plate returns; the louvres close to hairlines of
 *              light and the camera pulls back into black
 *
 * Everything derives from `local`; frame.time only drives idle sway and a
 * slow drift of the studio light. Two things are damped over time so fast
 * scrolling can't strobe: the backlight swell and the light sweep.
 */

const A = 0.08
const B = 0.92
const SPAN = (B - A) / N
/** half-width (in beats) of each turn, centred on the boundary between two plates */
const TURN = 0.3
const ANCHORS = Array.from({ length: N }, (_, i) => A + SPAN * (i + 0.55))
const INTRO_IN = 0.035
const CARD_IN = 0.094
const CARD_OUT = 0.915

/** louvre spacing, extra parting around the plate in view, how far it slides forward */
const SP = 0.5
const PART = 0.56
const FWD = 0.62
/** louvre tilt at rest (radians from facing the camera); hairline = π/2 */
const LOUVRE = 1.3
const HAIR = Math.PI / 2 - 0.02
/** the column's three-quarter yaw */
const YAW = -0.34
const ENV_REST = 1.8

/** a long, front-loaded glide with a soft start and a settled finish */
const glide = (t: number) => {
  const x = Math.pow(clamp(t), 0.72)
  return x * x * (3 - 2 * x)
}
/** 0 → 1 → 0 bump over x ∈ [-1, 1] */
const bump = (x: number) => {
  const a = clamp(1 - x * x)
  return a * a
}

/** Continuous plate index (0..N-1): holds mid-beat, turns across the boundaries. */
function plateAt(local: number) {
  const u = (local - A) / SPAN
  let f = 0
  let turning = 0
  for (let j = 1; j < N; j++) {
    f += glide((u - (j - TURN)) / (2 * TURN))
    turning = Math.max(turning, bump((u - j) / TURN))
  }
  return { f, u, turning }
}

export default function create(): Chapter {
  const group = new THREE.Group()
  let deck: Deck
  let hud: Hud
  let canvas: HTMLCanvasElement | null = null
  let active = false
  let mobile = false
  let lastLocal = 0
  let snap = true
  let calm = 1
  let swell = 0

  // the pose is computed in update() (so the world halo can sit behind the plate) and copied in camera()
  const pose = { pos: new THREE.Vector3(0, 0.4, 9), target: new THREE.Vector3(), fov: 30 }
  const probe = new THREE.PerspectiveCamera()
  const pv = new THREE.Vector3()
  const dir = new THREE.Vector3()
  const box: THREE.Vector3[] = Array.from({ length: 8 }, () => new THREE.Vector3())
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  let lastHoverX = 9
  let lastHoverY = 9
  /** where the plate in view sits on screen (world-field units: x = ndc.x·aspect) */
  const slot = { x: 0.3, y: 0, ok: false }

  function aim(cy: number, d: number, elev: number, ax: number, ay: number, tv: number, th: number) {
    pose.pos.set(0, cy + d * Math.sin(elev), d * Math.cos(elev))
    // aim off-centre so the subject (0, cy, 0) lands at (ax, ay) on screen
    const s = ax * th * d
    const v = ay * tv * d
    pose.target.set(-s, cy - v * Math.cos(elev), v * Math.sin(elev))
  }

  /**
   * Frame a box (centre cy, half extents hw/hh) into the space the copy
   * leaves free, then find where the plate slot and the backlight land.
   */
  function computePose(frame: Frame, m: HudMetrics, cy: number, hw: number, hh: number, hd: number, bias: number, push: number, lightY: number) {
    const W = Math.max(1, frame.width)
    const H = Math.max(1, frame.height)
    const aspect = W / H
    const portrait = H > W
    const fov = portrait ? 34 : 28
    const tv = Math.tan(THREE.MathUtils.degToRad(fov / 2))
    const th = tv * aspect
    const gutter = m.valid ? m.gutter : 24
    const safeTop = m.valid ? m.safeTop : H * 0.11
    const safeBottom = m.valid ? m.safeBottom : H * 0.11
    let x0: number, x1: number, y0: number, y1: number
    if (portrait) {
      x0 = gutter
      x1 = W - gutter
      y0 = safeTop + 2
      const copyTop = m.valid ? Math.min(m.cardTop, m.introTop || m.cardTop) : H * 0.55
      y1 = copyTop - 12
    } else {
      x0 = (m.valid ? m.colRight : W * 0.36) + 36
      x1 = W - gutter * 1.2
      y0 = safeTop + 4
      y1 = H - safeBottom - 4
    }
    const fill = portrait ? 0.98 : 0.92
    const cx = (x0 + x1) / W - 1
    const cyN = 1 - (y0 + y1) / H
    const hwN = Math.max(0.15, ((x1 - x0) / W) * fill)
    const hhN = Math.max(0.12, ((y1 - y0) / H) * fill)
    const elev = portrait ? 0.06 : 0.075

    // the box corners
    let k = 0
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) box[k++].set(sx * hw, cy + sy * hh, sz * hd)

    let d = Math.max(hw / (th * hwN), hh / (tv * hhN)) + hd
    let ax = cx
    let ay = cyN + bias * hhN
    probe.fov = fov
    probe.aspect = aspect
    probe.updateProjectionMatrix()
    for (let it = 0; it < 3; it++) {
      aim(cy, d, elev, ax, ay, tv, th)
      probe.position.copy(pose.pos)
      probe.lookAt(pose.target)
      probe.updateMatrixWorld()
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (const b of box) {
        pv.copy(b).project(probe)
        if (pv.x < minX) minX = pv.x
        if (pv.x > maxX) maxX = pv.x
        if (pv.y < minY) minY = pv.y
        if (pv.y > maxY) maxY = pv.y
      }
      if (!Number.isFinite(minX + maxX + minY + maxY)) break
      const kk = Math.max((maxX - minX) / (2 * hwN), (maxY - minY) / (2 * hhN))
      ax -= (minX + maxX) / 2 - cx
      ay -= (minY + maxY) / 2 - (cyN + bias * hhN)
      d *= clamp(kk, 0.5, 2)
    }
    d *= push
    aim(cy, d, elev, ax, ay, tv, th)
    pose.fov = fov

    probe.position.copy(pose.pos)
    probe.lookAt(pose.target)
    probe.updateMatrixWorld()
    pv.set(0, lightY, -0.9).project(probe)
    if (Number.isFinite(pv.x + pv.y)) {
      slot.x = pv.x * aspect
      slot.y = pv.y
      slot.ok = true
    }
  }

  return {
    id: 'services',
    group,
    anchors: ANCHORS,

    async init(ctx: ChapterContext) {
      mobile = ctx.mobile
      deck = buildDeck(ctx.mobile, ctx.world.envMap)
      group.add(deck.column, deck.back)
      await nextFrame()
      hud = new Hud(ctx.stage, k => window.__hark?.land('services', true, ANCHORS[k]))

      // click a plate to land on it (click, not pointerdown: touch scrolls must not jump)
      canvas = ctx.renderer.domElement
      canvas.addEventListener('click', e => {
        if (!active || !canvas || lastLocal < A - 0.02 || lastLocal > CARD_OUT) return
        const r = canvas.getBoundingClientRect()
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
        const k = pick(ctx)
        if (k >= 0) window.__hark?.land('services', true, ANCHORS[k])
      })
    },

    onEnter() {
      active = true
      snap = true
    },
    onLeave() {
      active = false
      if (canvas) canvas.style.cursor = ''
    },

    update(local, frame, ctx) {
      const w = ctx.world.params
      const post = ctx.post.params
      const rm = frame.reducedMotion
      // calm: reduced motion or Motion off — no sway, no time-driven drift
      const still = rm || ctx.reducedMotion || !!frame.still
      const t = frame.time
      const dt = frame.dt
      if (Math.abs(local - lastLocal) > 0.04) snap = true
      lastLocal = local

      const { f, u, turning } = plateAt(local)
      // presenting: the plate in view is out of the louvres
      const open = glide(u / 0.32) * (1 - glide((u - 10.72) / 0.3))
      // the louvres: hairlines → open (intro, under the cut) … open → hairlines (out beat)
      const louvreIn = glide(local / 0.06)
      const louvreOut = glide((local - 0.915) / 0.07)
      const tilt = lerp(HAIR, LOUVRE, louvreIn * (1 - louvreOut))
      // camera: the whole column (intro / out) ↔ the plate in view
      const near = glide((local - 0.064) / 0.052) * (1 - glide((local - 0.905) / 0.08))
      // speed calm: 1 at reading pace, 0 when scrubbing fast
      const calmV = 1 - smoothstep(0.5, 1.2, Math.abs(frame.velocity))
      calm = snap ? calmV : damp(calm, calmV, calmV < calm ? 10 : 2.5, dt)

      // ---------- the column
      const idle = still ? 0 : 1
      const yaw = YAW + 0.1 * local + idle * 0.012 * Math.sin(t * 0.21)
      deck.column.rotation.y = yaw
      deck.column.position.y = idle * 0.012 * Math.sin(t * 0.37)
      const vis = mobile ? 3.3 : 4.6
      for (const p of deck.plates) {
        const i = p.index
        const d = i - f
        const ad = Math.abs(d)
        const sel = open * (1 - smoothstep(0, 1, ad))
        const sgn = d < 0 ? -1 : d > 0 ? 1 : 0
        const far = smoothstep(1.2, 4.4, ad)
        const y = -d * SP - PART * open * sgn * smoothstep(0, 1, ad)
        const z = FWD * sel - 0.9 * far * near
        p.holder.position.set(0, y, z)
        p.holder.rotation.x = -tilt * (1 - sel)
        p.holder.rotation.y = -yaw * sel
        // far plates are off-screen once the camera is in close: skip them (transmission is costly)
        p.holder.visible = near < 0.98 || ad < vis

        // the glass: frosted louvres, the plate in view thaws a touch; far ones fade into black
        const dim = 1 - 0.82 * far * near
        p.caps.roughness = lerp(0.52, 0.36, sel)
        p.caps.color.setScalar(dim)
        p.caps.envMapIntensity = lerp(0.5, 0.85, sel) * dim
        p.sides.envMapIntensity = lerp(2.2, 4.2, sel) * dim
        p.sides.color.setScalar(lerp(0.75, 1, sel) * dim)

        // the etching: razor lines on the face, light bleeding into the frost behind them
        const faceB = lerp(0.14 * louvreIn * (1 - louvreOut), mobile ? 1.35 : 1.6, sel * sel) * dim
        p.faceMat.uniforms.uBright.value = faceB
        p.glowMat.uniforms.uBright.value = lerp(0.08, 0.24, sel) * dim
        // a light band crosses the etched lines once as the plate settles (gone by the anchor)
        const s = clamp((u - i - 0.1) / 0.38)
        p.faceMat.uniforms.uSweep.value = lerp(-1.6, 1.6, s)
        p.faceMat.uniforms.uSweepAmt.value = (rm ? 0.4 : 1.1) * sel * calm * (s > 0 && s < 1 ? 1 : 0)
      }

      // ---------- framing: the column (intro / out) ↔ the plate in view
      const m = hud.metrics()
      const colCY = -((N - 1) / 2 - f) * SP
      const cy = lerp(colCY, 0, near)
      const hw = lerp(TILE_W * 0.52, TILE_W * 0.56, near)
      const hh = lerp(((N - 1) / 2) * SP + 0.3, TILE_H / 2 + SP + PART * 0.55, near)
      const hd = lerp(0.35, 0.45, near)
      // at the ends of the column, frame the plate a little off-centre toward the empty end
      const bias = near * 0.16 * (1 - 2 * clamp(f / (N - 1)))
      const push = 1 + 0.06 * (1 - glide(local / 0.07)) - 0.05 * louvreOut
      computePose(frame, m, cy, hw, hh, hd, bias, push, lerp(colCY, 0, open))

      // ---------- the backlight: tall behind the whole column → a softbox behind the plate in view
      const target = 1 - 0.3 * turning * calm
      swell = snap ? target : damp(swell, target, 3, dt)
      // the backlight breathes, very slowly (idle only)
      const breathe = 1 + idle * 0.035 * Math.sin(t * 0.55)
      const bu = deck.backMat.uniforms
      const colHalf = ((N - 1) / 2) * SP + 0.3
      // a light slit behind the whole column → a plate-sized softbox behind the plate in view
      const lit = 0.3 * swell * breathe * (0.3 + 0.7 * louvreIn) * (1 - 0.7 * louvreOut)
      bu.uStrength.value = lit
      ;(bu.uHalf.value as THREE.Vector2).set(lerp(0.42, TILE_W * 0.44, open), lerp(colHalf, TILE_H * 0.4, open))
      bu.uSoft.value = lerp(0.4, 0.2, open)
      bu.uTail.value = lerp(2.2, 1.3, open)
      bu.uTailAmt.value = lerp(0.12, 0.05, open)
      ;(bu.uHot.value as THREE.Vector2).set(0.35 * open, 0.45 * open)
      deck.back.position.set(0, lerp(colCY, 0, open), -0.95)
      deck.back.lookAt(pose.pos.x, pose.pos.y, pose.pos.z)

      // ---------- world: the halo behind the plate, the light sweep on the bevels
      dir.copy(pose.target).sub(pose.pos).normalize()
      const cyaw = Math.atan2(dir.x, -dir.z)
      const pitch = Math.asin(clamp(dir.y, -1, 1))
      w.top = '#030304'
      w.bottom = '#000000'
      w.haloColor = '#e6eeff'
      if (slot.ok) w.focus.set(slot.x + Math.sin(cyaw) * 0.25, slot.y + pitch * 0.2)
      w.halo = (0.4 + 0.3 * open * swell) * (1 - 0.6 * louvreOut)
      w.haloSize = lerp(1.3, 1.0, open)
      w.slits = 0.14 * (1 - louvreOut)
      w.slitAngle = 0
      // the light sweep: while a plate turns in, the studio swings away and back
      // (sin(π·frac) is 0 at every rest) so the strips run along its bevels
      const sweep = Math.sin(Math.PI * (f - Math.floor(f)))
      const envTurn = ENV_REST - 0.9 * sweep * calm + idle * 0.05 * Math.sin(t * 0.17) - 0.5 * louvreOut
      w.envTurn = envTurn
      w.env = 1
      w.keyDir.set(-0.45, 0.8, 0.5)
      // no key light: on a polish this smooth its highlight is a sub-pixel HDR
      // line that beads under bloom; the (prefiltered) studio strips carry the edges
      w.key = 0
      w.fill = 0.05
      for (const p of deck.plates) {
        p.caps.envMapRotation.y = envTurn
        p.sides.envMapRotation.y = envTurn
      }
      snap = false

      // ---------- post: deep vignette, bloom only on the brightest etched lines.
      // Measured: with a plate presented, bloom is the soft neon bleed around
      // the etched icon and the glint on the lit bevels (up to 137/255 on/off);
      // with the column at rest (intro, landing, out) nothing crosses the
      // threshold (max 1/255), so the pass is switched off there.
      post.bloomStrength = 0.26 * smoothstep(0.05, 0.5, open)
      post.bloomRadius = 0.3
      post.bloomThreshold = 1.05
      post.vignette = 0.58

      // ---------- copy
      const introOn = local >= INTRO_IN && local < CARD_IN
      const shown = local >= CARD_IN && local < CARD_OUT ? Math.max(0, Math.min(N - 1, Math.round(f))) : -1
      hud.update(introOn, shown, shown)

      // ---------- hover: a pointer over a plate (desktop)
      if (active && !mobile && canvas) {
        const px = frame.pointerRaw.x
        const py = frame.pointerRaw.y
        if (px !== lastHoverX || py !== lastHoverY) {
          lastHoverX = px
          lastHoverY = py
          ndc.set(px, py)
          const k = local > A - 0.02 && local < CARD_OUT ? pick(ctx) : -1
          canvas.style.cursor = k >= 0 ? 'pointer' : ''
        }
      }
    },

    camera(_local, frame, out: CameraPose) {
      out.position.copy(pose.pos)
      out.target.copy(pose.target)
      out.fov = pose.fov
      out.roll = 0
      out.parallax = frame.mobile || frame.reducedMotion || frame.still ? 0 : 0.18
    },
  }

  /** plate under `ndc`, or -1 */
  function pick(ctx: ChapterContext): number {
    raycaster.setFromCamera(ndc, ctx.camera)
    const hits = raycaster.intersectObjects(
      deck.plates.filter(p => p.holder.visible).map(p => p.mesh),
      false,
    )
    if (!hits.length) return -1
    const k = hits[0].object.userData.plate
    return typeof k === 'number' ? k : -1
  }
}
