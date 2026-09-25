import * as THREE from 'three'
import type { CameraPose, Chapter, ChapterContext, Frame } from '../../core/types'
import { el, reveal, rise, setRise } from '../../core/dom'
import { BRAND, MICROCOPY } from '../../content'
import { clamp, lerp, segment, smoothstep } from '../../core/math'
import { nextFrame } from '../../core/yield'
import { FLOOR_MIRROR, MARK_S, THAW_A, THAW_B, buildCard, buildFloor, buildMark, buildReflection, refineMark, type HeroSet } from './scene'
import './hero.css'

/*
 * HERO — "Frost". One object in a black gallery: the Hark mark in
 * sandblasted glass with a deep polished bevel, lit from behind, floating
 * over a black mirror floor.
 *
 *   0.00–0.10  INTRO   the mark large, centred-right, a slight three-quarter;
 *                      a slow turntable sway (±12°) and a light sweep along
 *                      the bevels every ~8 s. After the loader (time-based,
 *                      ~1.8 s): the backlight fades up from black, the frost
 *                      lights from the centre outward, one highlight sweeps.
 *   0.10–0.56  MACRO   the camera travels in close: along the polished bevel,
 *                      across the sandblasted face (the backlight drifts
 *                      behind it, so the frost gradient shifts; the grain
 *                      reads), then a clear THAW window glides over the face
 *                      along a light strip behind the glass: razor sharp in
 *                      the window, a soft frosted bar outside it, a
 *                      crystalline melt front at its edge.
 *   0.56–0.93  PAYOFF  pull back; the mark settles right of centre (upper
 *                      half on portrait), front-on-ish; tagline + CTAs.
 *   0.93–1.00  OUT     the camera drifts into the frosted face as the breath
 *                      cut fogs the frame. Calm (reduced motion / Motion
 *                      off): the camera holds the payoff pose and the
 *                      engine's cut fades through black.
 *
 * Every pose derives from `local`; frame.time only drives the sway and the
 * light sweep (none under reduced motion; frozen with Motion off); the reveal
 * runs on its own clock.
 */

/** smootherstep on a segment */
const sm = (x: number, a: number, b: number) => {
  const t = segment(x, a, b)
  return t * t * t * (t * (t * 6 - 15) + 10)
}
const outQuart = (t: number) => 1 - Math.pow(1 - clamp(t), 4)

/** One camera key: target (world), orbit (az/el/dist), lens, screen offset, and the mark's turn. */
interface Key {
  at: number
  /** zero velocity here (the camera settles) */
  hold: boolean
  /** [tx, ty, tz, az, el, ln(dist), fov, sx, sy, rot, tilt] */
  v: number[]
}
const TX = 0
const TY = 1
const TZ = 2
const AZ = 3
const EL = 4
const LD = 5
const FOV = 6
const SX = 7
const SY = 8
const ROT = 9
const TILT = 10
const NV = 11

/** the macro captions' local windows: 01 polished edge, 02 sandblasted face, 03 thaw */
const BEATS: [number, number][] = [
  [0.14, 0.3],
  [0.31, 0.43],
  [0.44, 0.55],
]

/** mark-unit point (1u tall mark) → world */
const U = (x: number) => x * MARK_S

/** Framing for the rest poses: where the mark centre sits (NDC), and how much of the frame it fills. */
interface Fit {
  sx: number
  sy: number
  /** mark height as a fraction of the viewport height */
  hf: number
  /** mark width as a fraction of the viewport width */
  wf: number
}
const FIT: Record<'land' | 'port', Record<'intro' | 'pay', Fit>> = {
  land: {
    intro: { sx: 0.3, sy: 0.07, hf: 0.6, wf: 0.42 },
    pay: { sx: 0.42, sy: 0.05, hf: 0.5, wf: 0.34 },
  },
  port: {
    intro: { sx: 0, sy: 0.3, hf: 0.4, wf: 0.8 },
    pay: { sx: 0, sy: 0.36, hf: 0.34, wf: 0.72 },
  },
}

export default function create(): Chapter {
  const group = new THREE.Group()
  let set: HeroSet | null = null
  let reduced = false
  let mobile = false

  // DOM
  let intro: HTMLElement
  let payoff: HTMLElement
  let title: HTMLElement
  const caps: HTMLElement[] = []

  // reveal clock (performance time, seconds)
  let revealAt = -1
  let initAt = 0
  const now = () => performance.now() / 1000

  // pose (computed in update, written in camera)
  const pos = new THREE.Vector3()
  const tgt = new THREE.Vector3()
  let fov = 30
  let parallax = 0.2
  const tmpF = new THREE.Vector3()
  const tmpR = new THREE.Vector3()
  const tmpU = new THREE.Vector3()
  const tmpW = new THREE.Vector3()
  const tmpC = new THREE.Vector3()
  const tmpP = new THREE.Vector3()
  const tmpQ = new THREE.Vector3()
  const cardX = new THREE.Vector3()
  const cardY = new THREE.Vector3()
  const cardN = new THREE.Vector3()
  const lineA = new THREE.Vector2()
  const lineB = new THREE.Vector2()
  const focus = new THREE.Vector2()
  const focusW = new THREE.Vector3()
  const UP = new THREE.Vector3(0, 1, 0)
  const tmpM = new THREE.Matrix4()
  const val = new Array<number>(NV).fill(0)
  const keys: Key[] = []
  const tang: number[][] = []

  const fitDist = (f: Fit, fovDeg: number, aspect: number, markAspect: number) => {
    const tanV = Math.tan(THREE.MathUtils.degToRad(fovDeg / 2))
    return Math.max(MARK_S / (f.hf * 2 * tanV), (MARK_S * markAspect) / (f.wf * 2 * tanV * aspect))
  }

  /** the story's camera keys for this viewport */
  const buildKeys = (portrait: boolean, aspect: number, markAspect: number) => {
    const F = portrait ? FIT.port : FIT.land
    const dIntro = Math.log(fitDist(F.intro, 30, aspect, markAspect))
    const dPay = Math.log(fitDist(F.pay, 30, aspect, markAspect))
    // close-ups back off a little on narrow screens
    const m = portrait ? Math.log(1.35) : 0
    const k = (at: number, hold: boolean, v: number[]) => ({ at, hold, v })
    keys.length = 0
    keys.push(
      // intro: the mark at a slight three-quarter, a touch below eye level
      k(0.0, true, [0, 0, 0, 0.0, 0.07, dIntro, 30, F.intro.sx, F.intro.sy, -0.3, 0]),
      k(0.075, true, [0, 0, 0, 0.0, 0.07, dIntro, 30, F.intro.sx, F.intro.sy, -0.3, 0]),
      // 01 polished edge: grazing along the upper loop's bevel from above-left
      k(0.2, false, [U(-0.12), U(0.3), U(0.06), -0.7, 0.26, Math.log(2.6) + m, 26, 0, 0, -0.12, 0.02]),
      // …gliding along the top of the mark to the right
      k(0.31, false, [U(0.2), U(0.24), U(0.06), 0.5, 0.2, Math.log(2.4) + m, 26, 0, 0, 0.12, 0.0]),
      // 02 sandblasted face: nearly front-on, close on the right loop (the light drifts behind)
      k(0.42, false, [U(0.22), U(-0.04), U(0.06), 0.16, 0.04, Math.log(2.6) + m, 28, 0, 0, 0.04, 0]),
      // 03 thaw: the centre of the face, a clear window gliding over it
      k(0.52, false, [U(0.14), U(-0.13), U(0.06), -0.06, 0.02, Math.log(2.3) + m, 28, 0, 0, -0.04, 0]),
      // payoff: pulled back, right of centre (upper half on portrait), front-on-ish
      k(0.65, true, [0, 0, 0, 0.0, 0.065, dPay, 30, F.pay.sx, F.pay.sy, -0.2, 0]),
      k(0.925, true, [0, 0, 0, 0.0, 0.065, dPay, 30, F.pay.sx, F.pay.sy, -0.2, 0]),
      // out: into the frosted face
      k(1.0, false, [U(0.08), U(0.08), 0, 0.0, 0.03, Math.log(0.9), 30, 0.05, 0.04, -0.06, 0]),
    )
    // Catmull-Rom tangents (per unit local); zero at holds and at the ends
    tang.length = 0
    for (let i = 0; i < keys.length; i++) {
      const t = new Array<number>(NV).fill(0)
      if (!keys[i].hold && i > 0 && i < keys.length - 1) {
        const a = keys[i - 1]
        const b = keys[i + 1]
        for (let j = 0; j < NV; j++) t[j] = (b.v[j] - a.v[j]) / (b.at - a.at)
      }
      tang.push(t)
    }
    // the last key keeps drifting: carry the approach speed through the cut
    const n = keys.length - 1
    for (let j = 0; j < NV; j++) tang[n][j] = (keys[n].v[j] - keys[n - 1].v[j]) / (keys[n].at - keys[n - 1].at)
  }
  let keyW = -1
  let keyH = -1

  /** a world point seen from the camera, projected onto the card plane (card coords) */
  const onCardWorld = (s: HeroSet, world: THREE.Vector3, out: THREE.Vector2) => {
    const d = tmpP.copy(world).sub(pos)
    const den = d.dot(cardN)
    const t = tmpQ.copy(s.card.position).sub(pos).dot(cardN) / (Math.abs(den) > 1e-6 ? den : 1e-6)
    const x = d.multiplyScalar(t).add(pos).sub(s.card.position)
    out.set(x.dot(cardX), x.dot(cardY))
  }
  /** a point on the mark (mark units), projected onto the card plane */
  const onCard = (s: HeroSet, markPt: THREE.Vector3, out: THREE.Vector2) =>
    onCardWorld(s, tmpW.copy(markPt).applyMatrix4(s.logo.root.matrixWorld), out)

  /** Hermite-interpolate the keys at `local` into val[] */
  const sample = (local: number) => {
    let i = 0
    while (i < keys.length - 2 && local > keys[i + 1].at) i++
    const a = keys[i]
    const b = keys[i + 1]
    const h = b.at - a.at
    const t = clamp((local - a.at) / h)
    const t2 = t * t
    const t3 = t2 * t
    const h00 = 2 * t3 - 3 * t2 + 1
    const h10 = t3 - 2 * t2 + t
    const h01 = -2 * t3 + 3 * t2
    const h11 = t3 - t2
    const ma = tang[i]
    const mb = tang[i + 1]
    for (let j = 0; j < NV; j++) val[j] = h00 * a.v[j] + h10 * h * ma[j] + h01 * b.v[j] + h11 * h * mb[j]
  }

  return {
    id: 'hero',
    group,
    anchors: [0.8],

    async init(ctx: ChapterContext) {
      reduced = ctx.reducedMotion
      mobile = ctx.mobile
      initAt = now()

      const mark = buildMark(mobile, ctx.world.envMap)
      await nextFrame()
      refineMark(mark.logo.mark.geometry)
      await nextFrame()
      // the frame renders into the post chain's own targets; three's glass buffer is anything else
      const card = buildCard(rt => ctx.post.isFrameTarget(rt))
      const floor = buildFloor()
      const reflection = buildReflection(mark.logo.mark.geometry)
      set = { ...mark, ...card, floor, reflection }
      group.add(set.card, set.floor, set.pivot, set.reflection)

      // ---- DOM
      intro = el('div', 'hf-intro', undefined, ctx.stage)
      el('p', 'hud-eyebrow', MICROCOPY.signalEyebrow, intro)
      el('p', 'hud-body hf-manifesto', BRAND.manifesto, intro)
      const hint = el('p', 'hud-label hf-hint', undefined, intro)
      el('span', 'hf-hint-line', undefined, hint).setAttribute('aria-hidden', 'true')
      el('span', '', MICROCOPY.scrollHint, hint)

      // macro captions: a watch-film detail index (decorative)
      const capWrap = el('div', 'hf-caps', undefined, ctx.stage)
      capWrap.setAttribute('aria-hidden', 'true')
      ;['Polished edge', 'Sandblasted face', 'Thaw'].forEach((txt, i) => {
        const c = el('p', 'hud-label hf-cap', undefined, capWrap)
        el('span', 'hf-cap-n', `0${i + 1}`, c)
        el('span', 'hf-cap-line', undefined, c)
        el('span', 'hf-cap-t', txt, c)
        caps.push(c)
      })

      payoff = el('div', 'hf-payoff', undefined, ctx.stage)
      const inner = el('div', 'hf-payoff-inner', undefined, payoff)
      title = rise(el('h1', 'hud-title hf-title', undefined, inner), 'Make the internet <em>listen.</em>')
      const ctas = el('div', 'hf-ctas', undefined, inner)
      const see = el('button', 'hud-btn', 'See the work', ctas)
      see.type = 'button'
      see.addEventListener('click', () => window.__hark?.land('work'))
      const start = el('a', 'hud-btn hud-btn--ghost', 'Start a project', ctas)
      start.href = '#contact'
      start.addEventListener('click', e => {
        if (!window.__hark) return
        e.preventDefault()
        window.__hark.land('contact')
      })

      const onReveal = () => {
        if (revealAt < 0) revealAt = now()
      }
      if (document.documentElement.dataset.ready === '1') onReveal()
      else window.addEventListener('hark:reveal', onReveal, { once: true })
    },

    update(local: number, frame: Frame, ctx: ChapterContext) {
      if (!set) return
      const s = set
      const t = frame.time
      const portrait = frame.width <= frame.height
      const aspect = frame.width / Math.max(1, frame.height)
      // reduced motion: no sway, no sweep. Motion off: frame.time holds, so they hold too
      const calm = reduced ? 0 : 1
      // calm out-beat: no dive into the glass; the camera holds the payoff pose under the fade
      const still = reduced || !!frame.still

      // ---- reveal (time-based): backlight up from black, frost lights centre-out, one sweep
      const clock = now()
      if (revealAt < 0 && (document.documentElement.dataset.ready === '1' || clock - initAt > 20)) revealAt = clock
      const since = revealAt < 0 ? 0 : clock - revealAt
      const rk = reduced ? 3 : 1
      const rLight = sm(since * rk, 0.0, 1.25)
      const rSpread = sm(since * rk, 0.1, 1.6)
      const rHalo = sm(since * rk, 0.2, 1.8)
      const rSlit = sm(since * rk, 0.7, 1.9)
      const rSweep = reduced ? 0 : 1.1 * (1 - outQuart(segment(since, 0.8, 2.4))) * smoothstep(0.6, 0.9, since)

      // ---- camera keys
      if (frame.width !== keyW || frame.height !== keyH) {
        keyW = frame.width
        keyH = frame.height
        buildKeys(portrait, aspect, s.markAspect)
      }
      sample(still ? Math.min(local, 0.925) : local)
      const macro = smoothstep(0.08, 0.2, local) * (1 - smoothstep(0.52, 0.64, local))
      const payW = smoothstep(0.56, 0.66, local)
      const outW = smoothstep(0.925, 1, local)
      const dist = Math.exp(val[LD])
      fov = val[FOV]
      const tanV = Math.tan(THREE.MathUtils.degToRad(fov / 2))
      tgt.set(val[TX], val[TY], val[TZ])
      const ce = Math.cos(val[EL])
      pos.set(Math.sin(val[AZ]) * ce, Math.sin(val[EL]), Math.cos(val[AZ]) * ce).multiplyScalar(dist).add(tgt)
      tmpF.subVectors(tgt, pos).normalize()
      tmpR.crossVectors(tmpF, UP).normalize()
      tmpU.crossVectors(tmpR, tmpF)
      const shiftR = -val[SX] * dist * tanV * aspect
      const shiftU = -val[SY] * dist * tanV
      pos.addScaledVector(tmpR, shiftR).addScaledVector(tmpU, shiftU)
      tgt.addScaledVector(tmpR, shiftR).addScaledVector(tmpU, shiftU)
      parallax = lerp(0.22, 0.03, macro) * (1 - outW)

      // ---- the mark: a slow turntable sway (±12° at rest, quieter in the payoff, still in macro)
      const swayAmp = THREE.MathUtils.degToRad(lerp(12, 5, payW)) * (1 - macro) * (1 - outW) * calm
      const sway = swayAmp * Math.sin(t * 0.36)
      s.pivot.rotation.set(val[TILT] + 0.015 * Math.sin(t * 0.23) * calm * (1 - macro), val[ROT] + sway, 0)
      s.pivot.updateMatrixWorld(true)
      s.reflection.matrix.multiplyMatrices(FLOOR_MIRROR, s.logo.root.matrixWorld)

      // ---- light sweep along the bevels every ~8 s: glide across, rest, glide back
      let sweep = 0
      if (!reduced) {
        const cyc = t / 8
        const ph = cyc - Math.floor(cyc)
        const dir = Math.floor(cyc) % 2 === 0 ? 1 : -1
        sweep = 0.5 * dir * (sm(ph, 0.0, 0.32) * 2 - 1)
      }
      // in the macro shots the studio turns slowly instead (highlights crawl along the bevel)
      const turn = lerp(sweep, 0.9 * Math.sin(Math.PI * segment(local, 0.1, 0.56)) - 0.3, macro) + rSweep
      s.caps.envMapRotation.set(0, turn, 0)
      s.sides.envMapRotation.set(0, turn, 0)
      // the FROST does the lighting: the sandblasted faces keep only a faint sheen of the
      // studio (strong strip reflections read as brushed metal); the polished bevels keep it all
      s.caps.envMapIntensity = lerp(0.06, 0.3, rLight) * lerp(1, 0.6, macro)
      s.sides.envMapIntensity = lerp(0.35, 1.6, rLight)
      // a faint lift at the silhouette (light caught in the glass); the dark polished rims stay
      s.rim.uniforms.uStrength.value = 0.15 * rLight * (1 - 0.5 * macro)

      // ---- the thaw: a clear window glides across the face in beat 03
      // it runs down the centre of the lower diagonal band, from the right loop toward the bottom one
      const thawP = segment(local, 0.44, 0.55)
      // …and it's gone before the pull-back shows the whole mark (the light strip behind goes with it)
      const thawK = smoothstep(0.43, 0.46, local) * (1 - smoothstep(0.515, 0.545, local))
      s.capsU.uThaw.value.set(lerp(THAW_A.x, THAW_B.x, thawP), lerp(THAW_A.y, THAW_B.y, thawP), thawK)
      s.capsU.uThawR.value = 0.066
      s.capsU.uFront.value = 0.4
      s.caps.roughness = 0.46
      // the sandblast grain reads close up (sub-pixel far away: the mips flatten it)
      const gn = lerp(0.02, 0.06, macro)
      s.caps.normalScale.set(gn, gn)
      s.capsU.uGrain.value = lerp(0.05, 0.16, macro)

      // ---- the backlight card: camera-facing, behind the mark; it drifts in macro
      const camToMark = tmpC.copy(pos).negate().normalize() // the mark's centre is the origin
      const back = 1.7
      const drift = Math.sin(Math.PI * segment(local, 0.1, 0.56))
      const driftX = 0.9 * drift * Math.sin(Math.PI * 2 * segment(local, 0.1, 0.56) + 0.4)
      const driftY = -0.35 * drift
      s.card.position.set(0, 0, 0).addScaledVector(camToMark, back).addScaledVector(tmpR, driftX).addScaledVector(tmpU, driftY)
      tmpM.lookAt(pos, s.card.position, UP)
      s.card.quaternion.setFromRotationMatrix(tmpM)
      tmpM.extractBasis(cardX, cardY, cardN)
      const cardSize = MARK_S * 5.2
      s.card.scale.set(cardSize, cardSize, 1)
      const cu = s.card.material.uniforms
      cu.uHalf.value = cardSize / 2
      // the frost lights from the centre outward: a hot core, then a broad light box
      // behind every loop (glass buffer only; the room stays black)
      cu.uCore.value = lerp(0.08, 0.62, rSpread) * lerp(1, 1.15, macro)
      cu.uWideR.value = lerp(0.2, 1.6, rSpread)
      cu.uBarW.value = 0.1
      // in the macro shots the light sits behind whatever the camera studies, drifting
      // across it (so the face in view glows through and its frost gradient shifts);
      // in the thaw it slides off, so the razor line reads through the clear window
      const lineK = smoothstep(0.405, 0.44, local) * (1 - smoothstep(0.53, 0.56, local))
      const focusK = macro * (1 - 0.75 * lineK)
      if (focusK > 0) onCardWorld(s, focusW.set(val[TX], val[TY], val[TZ]), focus)
      const sweepX = -0.35 + 0.7 * sm(local, 0.14, 0.43)
      cu.uHot.value.set(lerp(0.12 + 0.3 * drift, focus.x + sweepX, focusK), lerp(0.06, focus.y + 0.12, focusK))
      // two slits behind the loops; in macro they glide behind the face
      cu.uSlitX.value.set(-0.62 + 0.55 * drift, 0.52 - 0.35 * drift)
      cu.uSlitA.value.set(1, 0.72)
      cu.uSlitH.value = 3.2
      cu.uRings.value = 1.6
      // close up the card fills the view: dim it there, or the faces clip to flat white
      // (and a little more behind the thaw, so its razor line reads through the clear glass)
      s.cardK.trans.glow = 0.62 * rLight * lerp(1, 0.55, macro) * (1 - 0.45 * lineK)
      s.cardK.trans.wide = 0.4 * rLight * lerp(1, 0.4, macro) * (1 - 0.45 * lineK)
      s.cardK.trans.slit = 3.2 * rLight * rSlit
      s.cardK.trans.width = 0.009
      s.cardK.trans.bar = 0.6 * rLight * rSlit
      // the thaw's light strip, straight behind the thaw path (from the camera): the window
      // glides along it, so inside the window it's a razor line, outside a frosted bar
      if (lineK > 0) {
        onCard(s, THAW_A, lineA)
        onCard(s, THAW_B, lineB)
        lineB.sub(lineA)
        const len = Math.max(lineB.length(), 1e-4)
        const nx = -lineB.y / len
        const ny = lineB.x / len
        cu.uLine.value.set(nx, ny, -(nx * lineA.x + ny * lineA.y))
      }
      s.cardK.trans.line = 6.5 * lineK
      s.cardK.trans.lineWidth = 0.0045
      // no rings: the polished bevels bend hairline rings into dashed 'tread' across
      // the macro shots; the thaw shows the clean light (and a slit) instead
      s.cardK.trans.rings = 0
      s.cardK.main.glow = 0.035 * rLight * (1 - 0.5 * macro)
      s.cardK.main.slit = 0.32 * rSlit * (1 - outW)
      s.cardK.main.width = 0.003

      // ---- floor pool + reflection
      const fu = s.floor.material.uniforms
      fu.uK.value = 0.045 * rHalo * (1 - 0.4 * macro)
      // portrait: the copy sits under the mark, so the reflection is only a faint top sliver
      const ru = s.reflection.material.uniforms
      ru.uStrength.value = 0.2 * rLight * (portrait ? 0.3 : 1)
      ru.uFade.value = portrait ? 6 : 1.6

      // ---- world: black, the halo behind the mark, two hairline slits
      const wp = ctx.world.params
      wp.top = '#020203'
      wp.bottom = '#000000'
      // the halo sits exactly behind the mark's centre on screen (the field's heading drift cancelled)
      const w = tmpW.set(0, 0, 0).sub(pos)
      const depth = Math.max(0.1, w.dot(tmpF))
      const ndcX = w.dot(tmpR) / (depth * tanV * aspect)
      const ndcY = w.dot(tmpU) / (depth * tanV)
      const yaw = Math.atan2(tmpF.x, -tmpF.z)
      const pitch = Math.asin(clamp(tmpF.y, -1, 1))
      wp.focus.set(ndcX * aspect + Math.sin(yaw) * 0.25, ndcY + pitch * 0.2)
      // the halo scales with the mark on screen
      const markH = MARK_S / (depth * tanV * 2) // fraction of the viewport height
      wp.halo = lerp(0.02, 0.75, rHalo) * (1 - 0.35 * macro)
      wp.haloSize = clamp(markH * 1.15, 0.45, 2)
      wp.haloColor = '#e6eeff'
      wp.slits = 0 // the card draws this chapter's slits (they must line up with the glass)
      wp.slitAngle = 0
      wp.envTurn = turn
      wp.env = 1
      wp.key = lerp(0.1, 0.6, rLight)
      wp.keyDir.set(-0.45, 0.8, 0.5)
      wp.fill = 0.04

      // ---- post: bloom only on true highlights (never the frost), deep vignette
      const pp = ctx.post.params
      pp.bloomStrength = 0.22
      pp.bloomRadius = 0.25
      pp.bloomThreshold = 1.6
      pp.vignette = 0.62
      pp.grain = 0.016
      pp.frost = still ? 0 : 0.2 * smoothstep(0.955, 1, local)

      // ---- DOM
      reveal(intro, 1 - smoothstep(0.06, 0.1, local))
      intro.classList.toggle('is-in', revealAt >= 0 && since > (reduced ? 0 : 0.6))
      for (let i = 0; i < caps.length; i++) {
        const [a, b] = BEATS[i]
        reveal(caps[i], smoothstep(a, a + 0.025, local) * (1 - smoothstep(b - 0.025, b, local)), 8)
      }
      reveal(payoff, smoothstep(0.6, 0.66, local) * (1 - smoothstep(0.93, 0.965, local)), 0)
      // the headline and its CTAs leave together (with the payoff's fade)
      setRise(title, local > 0.61 && local < 0.965)
    },

    camera(_local: number, _frame: Frame, out: CameraPose) {
      out.position.copy(pos)
      out.target.copy(tgt)
      out.fov = fov
      out.roll = 0
      out.parallax = parallax
    },
  }
}
