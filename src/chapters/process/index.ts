import * as THREE from 'three'
import type { CameraPose, Chapter, ChapterContext, Frame } from '../../core/types'
import { el, rise, setRise, reveal } from '../../core/dom'
import { PROCESS, STATS } from '../../content'
import { clamp, ease, lerp, segment, smoothstep, window01 } from '../../core/math'
import { nextFrame } from '../../core/yield'
import { buildPatternSdf } from './sdf'
import {
  BLOCK,
  FACE_Z,
  MARK_H,
  PANE,
  makeBlock,
  makeFilm,
  makeImpact,
  makeKerf,
  makeLightCard,
  makeNozzle,
  makePane,
  makePool,
  makeShaft,
  makeSpray,
  type Block,
  type Film,
  type Kerf,
  type Pane,
  type Spray,
} from './scene'
import './process.css'

/*
 * ANNEALED — "We listen first. Then we build."
 *
 * How frosted glass is made, as four vignettes in the black room, the camera
 * travelling along:
 *
 *   0.00–0.10  in-beat (under the breath cut): a raw block of clear glass
 *              under a single spotlight; the headline comes into focus
 *   0.10–0.27  01 LISTEN     a ring of light (the inspection scan) slides
 *                            slowly down through the block
 *   0.27–0.44  02 PROTOTYPE  the camera travels on to the pane; a thin matte
 *                            resist film is laid on it and a gantry line cuts
 *                            the Hark mark into it: the cut shows as crisp
 *                            light. The field of the film is weeded away.
 *   0.44–0.61  03 BUILD      SANDBLASTING: a chrome nozzle and a fine stream
 *                            of grains; the frost spreads across the exposed
 *                            glass behind a grainy front, the resist keeps the
 *                            mark clear
 *   0.61–0.78  04 SUPPORT    POLISH: the resist lifts off, a glint glides
 *                            round the polished bevel; the finished panel —
 *                            frosted field, razor-clear mark — glows backlit
 *   0.78–0.95  results: pull back to the finished panel; three frosted stat
 *              tiles (10 years, $1M+, 15)
 *   0.95–1.00  out-beat
 *
 * Everything is derived from `local`; frame.time only drives the spray and a
 * slow breathing sway.
 */

// ---------------------------------------------------------------- layout

const FLOOR = -PANE.h / 2 - PANE.bevel * 0.85
const PX = 6.2
/** block and pane centers (world) */
const CB = new THREE.Vector3(0, FLOOR + BLOCK.h / 2 + BLOCK.bevel * 0.85, 0)
const CP = new THREE.Vector3(PX, 0, 0)
const FILM_MARGIN = 0.05

// ---------------------------------------------------------------- timeline

const A = 0.1
const B = 0.78
const S = (B - A) / PROCESS.length
const ANCHORS = PROCESS.map((_, k) => A + S * (k + 0.55))
const STATS_AT = 0.875
const HEAD = [0.045, 0.29] as const
const CARD = [0.13, 0.785] as const
const TILES = [0.8, 0.955] as const

const SCAN = [0.07, 0.255] as const
const LAY = [0.272, 0.324] as const
const CUT = [0.32, 0.357] as const
const PEEL = [0.392, 0.452] as const
const NOZ_IN = [0.44, 0.475] as const
const BLAST = [0.462, 0.598] as const
const NOZ_OUT = [0.598, 0.632] as const
const LIFT = [0.604, 0.66] as const
const POLISH = [0.635, 0.775] as const

// 10 years, $1M+, 15 — in that order
const SHOW = [STATS[0], STATS[2], STATS[1]]

/** a triangle wave in [-1, 1] */
const tri = (x: number) => 1 - 4 * Math.abs(x - Math.floor(x + 0.5))

// ---------------------------------------------------------------- camera keys

interface Key {
  t: number
  pos: THREE.Vector3
  tgt: THREE.Vector3
  fov: number
  focus: THREE.Vector3
  /** on the glide INTO this key, ease back by this fraction mid-way */
  lift?: number
}
const DEG = Math.PI / 180
const UP = new THREE.Vector3(0, 1, 0)
const _f = new THREE.Vector3()
const _r = new THREE.Vector3()
const _u = new THREE.Vector3()

/** A key orbiting `c` (phi: degrees from the front, + = from the left), with `c` placed at screen NDC (sx, sy). */
function orbit(t: number, c: THREE.Vector3, phi: number, d: number, elev: number, sx: number, sy: number, aspect: number, fov: number, lift?: number): Key {
  const p = phi * DEG
  const e = elev * DEG
  const pos = new THREE.Vector3(c.x - Math.sin(p) * Math.cos(e) * d, c.y + Math.sin(e) * d, c.z + Math.cos(p) * Math.cos(e) * d)
  _f.subVectors(c, pos).normalize()
  _r.crossVectors(_f, UP).normalize()
  _u.crossVectors(_r, _f)
  const halfH = Math.tan((fov * DEG) / 2) * d
  const tgt = c.clone().addScaledVector(_r, -sx * halfH * aspect).addScaledVector(_u, -sy * halfH)
  return { t, pos, tgt, fov, focus: c.clone(), lift }
}

/**
 * The results pose: fit the finished panel into the band between the safe
 * top and the stat tiles (fractions of the viewport height, measured from the
 * DOM), square to the camera. Falls back to a fixed pose before layout.
 */
function resultsPose(aspect: number, fov: number, fit: Fit, fallbackD: number, fallbackSy: number): { d: number; sy: number } {
  if (!(fit.bottom > fit.top + 0.2)) return { d: fallbackD, sy: fallbackSy }
  const half = fit.bottom - fit.top // NDC half-height of the band
  const sy = 1 - (fit.top + fit.bottom)
  const tanH = Math.tan((fov * DEG) / 2)
  // the panel (with its bevel) fills ~86% of the band, and never runs off the sides
  const halfWorld = Math.max(1.26 / (0.86 * half), 1.2 / aspect)
  return { d: clamp(halfWorld / tanH, 7.2, 13), sy }
}

interface Fit {
  top: number
  bottom: number
}

function keysFor(aspect: number, fit: Fit): Key[] {
  const k: Key[] = []
  if (aspect >= 0.9) {
    const narrow = clamp((1.6 - aspect) / 0.6) // 0 at 16:10, 1 at 1:1
    const back = 1 + 0.2 * narrow
    const sx = 0.27 + 0.08 * narrow
    const f = 32
    k.push(orbit(0, CB, 26, 8.4 * back, 9, sx, 0.02, aspect, f))
    k.push(orbit(0.1, CB, 22, 7.7 * back, 8, sx, 0.02, aspect, f))
    k.push(orbit(0.2, CB, 15, 7.1 * back, 7, sx, 0.02, aspect, f))
    k.push(orbit(0.25, CB, 10, 6.9 * back, 7, sx, 0.02, aspect, f))
    k.push(orbit(0.315, CP, 14, 7.5 * back, 5, sx, 0.02, aspect, f, 0.2))
    k.push(orbit(0.425, CP, 9, 7.1 * back, 5, sx, 0.02, aspect, f))
    k.push(orbit(0.5, CP, -30, 7.3 * back, 9, sx, 0.01, aspect, f))
    k.push(orbit(0.585, CP, -26, 7.0 * back, 8, sx, 0.01, aspect, f))
    k.push(orbit(0.665, CP, 15, 6.8 * back, 5, sx, 0.02, aspect, f))
    k.push(orbit(0.77, CP, 21, 6.5 * back, 4, sx, 0.02, aspect, f))
    const r = resultsPose(aspect, 30, fit, 9.0 * (1 + 0.12 * narrow), 0.2)
    k.push(orbit(0.86, CP, 0, r.d, 3, 0, r.sy, aspect, 30))
    k.push(orbit(0.95, CP, 2, r.d * 0.97, 3, 0, r.sy, aspect, 30))
    k.push(orbit(1, CP, 3, r.d * 0.99, 3, 0, r.sy, aspect, 30))
  } else {
    const tall = clamp((0.62 - aspect) / 0.16) // 0 at tablet, 1 at phone
    const back = 1 + 0.12 * tall
    const sy = lerp(0.12, 0.16, tall)
    const f = 42
    k.push(orbit(0, CB, 22, 9.6 * back, 9, 0, sy, aspect, f))
    k.push(orbit(0.1, CB, 18, 9.0 * back, 8, 0, sy, aspect, f))
    k.push(orbit(0.2, CB, 12, 8.5 * back, 7, 0, sy, aspect, f))
    k.push(orbit(0.25, CB, 8, 8.3 * back, 7, 0, sy, aspect, f))
    k.push(orbit(0.315, CP, 12, 9.6 * back, 5, 0, sy, aspect, f, 0.45))
    k.push(orbit(0.425, CP, 8, 9.2 * back, 5, 0, sy, aspect, f))
    k.push(orbit(0.5, CP, -26, 9.4 * back, 9, 0, sy, aspect, f))
    k.push(orbit(0.585, CP, -22, 9.1 * back, 8, 0, sy, aspect, f))
    k.push(orbit(0.665, CP, 12, 8.9 * back, 5, 0, sy, aspect, f))
    k.push(orbit(0.77, CP, 17, 8.6 * back, 4, 0, sy, aspect, f))
    const r = resultsPose(aspect, f, fit, 10.6 * back, lerp(0.3, 0.38, tall))
    k.push(orbit(0.86, CP, 0, r.d, 3, 0, r.sy, aspect, f))
    k.push(orbit(0.95, CP, 2, r.d * 0.97, 3, 0, r.sy, aspect, f))
    k.push(orbit(1, CP, 3, r.d * 0.99, 3, 0, r.sy, aspect, f))
  }
  return k
}

const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

function sample(keys: Key[], local: number, pos: THREE.Vector3, tgt: THREE.Vector3, focus: THREE.Vector3): number {
  if (local <= keys[0].t) {
    pos.copy(keys[0].pos)
    tgt.copy(keys[0].tgt)
    focus.copy(keys[0].focus)
    return keys[0].fov
  }
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    if (local <= b.t) {
      const e = smoother(segment(local, a.t, b.t))
      pos.lerpVectors(a.pos, b.pos, e)
      tgt.lerpVectors(a.tgt, b.tgt, e)
      focus.lerpVectors(a.focus, b.focus, e)
      if (b.lift) pos.sub(tgt).multiplyScalar(1 + b.lift * Math.sin(Math.PI * e)).add(tgt)
      return lerp(a.fov, b.fov, e)
    }
  }
  const z = keys[keys.length - 1]
  pos.copy(z.pos)
  tgt.copy(z.tgt)
  focus.copy(z.focus)
  return z.fov
}

// ---------------------------------------------------------------- chapter

export default function create(): Chapter {
  const group = new THREE.Group()

  let ctxRef: ChapterContext | null = null
  let block: Block
  let shaft: ReturnType<typeof makeShaft>
  let blockPool: ReturnType<typeof makePool>
  let blockCard: ReturnType<typeof makeLightCard>
  // the pane rig: fixed light behind, a turntable with the pane and its tools
  const paneG = new THREE.Group()
  const turn = new THREE.Group()
  let pane: Pane
  let card: ReturnType<typeof makeLightCard>
  let panePool: ReturnType<typeof makePool>
  const filmG = new THREE.Group()
  const peel = new THREE.Group()
  let field: Film
  let resist: Film
  let kerf: Kerf
  let nozzle: THREE.Mesh
  let spray: Spray
  let impact: ReturnType<typeof makeImpact>
  let ready = false

  // DOM
  let head: HTMLElement, headline: HTMLElement
  let cardEl: HTMLElement
  const stepEls: HTMLElement[] = []
  const stepTitles: HTMLElement[] = []
  const fills: HTMLElement[] = []
  const segs: HTMLElement[] = []
  let statsEl: HTMLElement
  const tiles: HTMLElement[] = []
  let shown = -2
  let tilesShown = false
  const fillCache = [-1, -1, -1, -1]

  const tmpPos = new THREE.Vector3()
  const tmpTgt = new THREE.Vector3()
  const tmpFocus = new THREE.Vector3()
  const scratch = new THREE.PerspectiveCamera(40, 1, 0.1, 200)
  const impactLocal = new THREE.Vector3()
  const tipLocal = new THREE.Vector3()
  const dirLocal = new THREE.Vector3()
  const NOZ_AXIS = new THREE.Vector3(0, -1, 0)
  let keys: Key[] = []
  let keysAspect = -1
  /** band free for the results pose (fractions of the stage height), measured on resize */
  const fit: Fit = { top: 0, bottom: 0 }
  let fitDirty = true

  return {
    id: 'process',
    group,
    // the four steps, then the stats
    anchors: [...ANCHORS, STATS_AT],

    async init(ctx) {
      ctxRef = ctx
      const mobile = ctx.mobile

      // ---- station 1: the raw block, its spotlight and the inspection ring
      block = makeBlock(mobile)
      block.root.position.copy(CB)
      group.add(block.root)
      shaft = makeShaft(1.05, 4.2)
      shaft.mesh.position.set(CB.x, CB.y + BLOCK.h / 2 + 2.1 + 0.08, CB.z)
      group.add(shaft.mesh)
      blockPool = makePool(3.4, 2.4)
      blockPool.mesh.position.set(CB.x, FLOOR - 0.002, CB.z + 0.1)
      group.add(blockPool.mesh)
      // light behind the block: thick clear glass needs something crisp to bend
      blockCard = makeLightCard(3.8, 4.4)
      blockCard.mesh.position.set(CB.x + 0.1, CB.y + 0.2, CB.z - 1.5)
      blockCard.u.uSlitX.value = 0.05
      group.add(blockCard.mesh)
      await nextFrame()

      // ---- the pane: the resist pattern as a distance field (razor edges at any zoom)
      const sdf = await buildPatternSdf({
        w: PANE.w,
        h: PANE.h,
        markH: MARK_H,
        markY: 0.02,
        keyInset: 0.11,
        keyWidth: 0.018,
        keyRadius: 0.03,
        res: mobile ? 640 : 1024,
        spread: mobile ? 16 : 24,
      })
      await nextFrame()
      pane = makePane(sdf, mobile)
      paneG.position.copy(CP)
      group.add(paneG)
      paneG.add(turn)
      turn.add(pane.mesh)

      card = makeLightCard(4.2, 4.6)
      card.mesh.position.set(0, 0.05, -1.25)
      paneG.add(card.mesh)
      panePool = makePool(3.6, 2.2)
      panePool.mesh.position.set(0, FLOOR - 0.002, 0.2)
      paneG.add(panePool.mesh)

      // the resist film: the field (on a hinge at its top edge) + the pattern pieces
      field = makeFilm(sdf, -1, FILM_MARGIN)
      resist = makeFilm(sdf, 1, FILM_MARGIN)
      const hingeY = PANE.h / 2 - FILM_MARGIN
      peel.position.set(0, hingeY, 0)
      // the field lies a hair in front of the resist (no depth fight at the seam)
      field.mesh.position.set(0, -hingeY, 0.0008)
      peel.add(field.mesh)
      filmG.add(peel, resist.mesh)
      turn.add(filmG)
      kerf = makeKerf(sdf, FILM_MARGIN)
      kerf.mesh.position.z = FACE_Z + 0.004
      turn.add(kerf.mesh)

      // sandblasting
      nozzle = makeNozzle()
      turn.add(nozzle)
      spray = makeSpray(mobile ? 1100 : 2600)
      turn.add(spray.points)
      impact = makeImpact()
      turn.add(impact.mesh)
      await nextFrame()

      // ---- DOM
      const stage = ctx.stage
      head = el('div', 'pr-head', undefined, stage)
      el('p', 'hud-eyebrow', 'How it works', head)
      headline = rise(el('h2', 'hud-h2 pr-headline', undefined, head), 'We listen first. <em>Then we build.</em>')

      cardEl = el('div', 'pr-card hud-panel hud-panel--strong', undefined, stage)
      const steps = el('div', 'pr-steps', undefined, cardEl)
      PROCESS.forEach((p, i) => {
        const s = el('div', 'pr-step', undefined, steps)
        const n = String(i + 1).padStart(2, '0')
        stepTitles.push(rise(el('h3', 'pr-title', undefined, s), `<em>${n}</em> — ${p.title}`))
        el('p', 'hud-body pr-text', p.text, s)
        stepEls.push(s)
      })
      const track = el('ol', 'pr-track', undefined, cardEl)
      PROCESS.forEach(p => {
        const li = el('li', 'pr-seg', undefined, track)
        const bar = el('span', 'pr-bar', undefined, li)
        fills.push(el('span', 'pr-fill', undefined, bar))
        el('span', 'pr-name', p.title, li)
        segs.push(li)
      })

      statsEl = el('div', 'pr-stats', undefined, stage)
      SHOW.forEach((s, i) => {
        const t = el('div', 'pr-tile hud-panel hud-panel--strong', undefined, statsEl)
        t.style.setProperty('--i', String(i))
        el('p', 'pr-value', s.value, t)
        el('p', 'pr-label', s.label, t)
        tiles.push(t)
      })
      reveal(head, 0, 0)
      reveal(cardEl, 0, 0)
      reveal(statsEl, 0, 0)
      // measure the band above the tiles (layout only; opacity/visibility don't affect it)
      const measure = () => {
        const H = stage.clientHeight
        if (H < 10) return
        const top = head.offsetTop / H
        const bottom = (statsEl.offsetTop - 18) / H
        if (Math.abs(top - fit.top) > 1e-3 || Math.abs(bottom - fit.bottom) > 1e-3) {
          fit.top = top
          fit.bottom = bottom
          fitDirty = true
        }
      }
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(measure)
        ro.observe(stage)
        ro.observe(statsEl)
      }
      measure()
      ready = true
    },

    update(local, frame, ctx) {
      if (!ready) return
      const rm = frame.reducedMotion
      const t = frame.time
      const portrait = frame.height > frame.width * 1.1

      // ---- beat state
      const inSteps = local >= A && local <= B
      const idx = clamp(Math.floor((local - A) / S), 0, 3)
      const phase = clamp((local - A - idx * S) / S)
      const results = smoothstep(0.775, 0.86, local)

      // ================= 01 LISTEN: the block, the spotlight, the scan
      const atBlock = 1 - smoothstep(0.255, 0.32, local)
      const scanU = segment(local, SCAN[0], SCAN[1])
      const scanE = ease.inOutQuad(scanU)
      const top = BLOCK.h / 2 + BLOCK.bevel * 0.5
      const scanY = lerp(top - 0.06, -top + 0.06, scanE)
      block.ring.position.y = scanY
      block.haze.position.y = scanY
      const scanOn = window01(local, SCAN[0] - 0.005, SCAN[1] + 0.012, 0.025)
      block.ringMat.color.setScalar(1.25 * scanOn)
      block.hazeMat.color.setScalar(0.09 * scanOn)
      block.mat.envMapIntensity = 1.2 + 0.25 * scanOn
      // a slow turntable, settling as the inspection runs
      block.root.rotation.y = lerp(-0.34, 0.2, ease.outCubic(segment(local, 0, 0.3))) + (rm ? 0 : Math.sin(t * 0.25) * 0.015)
      shaft.u.uIntensity.value = atBlock * (0.75 + 0.25 * scanOn)
      blockPool.u.uIntensity.value = atBlock * 0.55
      blockCard.u.uIntensity.value = atBlock * 0.34
      blockCard.u.uSlit.value = 2.2
      block.root.visible = shaft.mesh.visible = blockPool.mesh.visible = blockCard.mesh.visible = local < 0.335

      // ================= 02 PROTOTYPE: lay the film, cut the mark in light, weed
      const lay = ease.inOutCubic(segment(local, LAY[0], LAY[1]))
      filmG.position.set(0, 0.35 * (1 - lay), FACE_Z + 0.0025 + 0.95 * (1 - lay))
      filmG.rotation.x = -0.55 * (1 - lay)
      const cutU = segment(local, CUT[0], CUT[1])
      kerf.u.uGantryY.value = lerp(1.02, -0.02, cutU)
      kerf.u.uGantry.value = window01(local, CUT[0] - 0.008, CUT[1] + 0.006, 0.01)
      const peelU = segment(local, PEEL[0], PEEL[1])
      kerf.u.uKerf.value = smoothstep(CUT[0] - 0.004, CUT[0] + 0.006, local) * (1 - smoothstep(PEEL[0], PEEL[0] + 0.02, local))
      // (kept in the scene at zero light through its station so its program compiles at prewarm)
      kerf.mesh.visible = local > 0.24 && local < 0.52
      // weeding: the field of the film swings up off its hinge and away
      const peelSwing = ease.inOutCubic(clamp(peelU / 0.7))
      const peelAway = ease.inCubic(segment(peelU, 0.45, 1))
      peel.rotation.x = -1.75 * peelSwing
      peel.position.y = PANE.h / 2 - FILM_MARGIN + 3.2 * peelAway
      peel.position.z = 0.25 * peelSwing
      // whole until it is weeded (the kerf light covers the seam while it is cut)
      field.u.uCut.value = local >= PEEL[0] ? 1 : 0
      field.mat.opacity = 1 - smoothstep(0.55, 1, peelU)
      field.mesh.visible = local > LAY[0] - 0.01 && peelU < 1
      // the resist peels away before the polish: lifts a touch and clears
      const liftU = ease.inOutCubic(segment(local, LIFT[0], LIFT[1]))
      resist.mesh.position.set(0, 0.12 * liftU, 0.28 * liftU)
      resist.mat.opacity = 1 - smoothstep(0.1, 0.85, liftU)
      resist.mesh.visible = local > LAY[0] - 0.01 && liftU < 1

      // ================= 03 BUILD: sandblasting
      const blastU = segment(local, BLAST[0], BLAST[1])
      const front = lerp(-0.1, 1.1, blastU)
      const blasting = window01(local, BLAST[0] - 0.004, BLAST[1] + 0.006, 0.012)
      // the nozzle rasters: sweeps up and down while the front advances
      const iy = 0.5 + 0.4 * tri(blastU * 4.5 + 0.25)
      const ix = clamp(front + 0.015, 0, 1)
      pane.u.uFront.value = local < BLAST[0] ? -0.3 : front
      pane.u.uImpact.value.set(ix, iy)
      pane.u.uImpactR.value = 0.14 * blasting
      impactLocal.set((ix - 0.5) * PANE.w, (iy - 0.5) * PANE.h, FACE_Z + 0.004)
      const nozIn = ease.outCubic(segment(local, NOZ_IN[0], NOZ_IN[1]))
      const nozOut = ease.inCubic(segment(local, NOZ_OUT[0], NOZ_OUT[1]))
      const nozVis = nozIn * (1 - nozOut)
      // the tip stands off the glass up and to the left, aimed at the impact
      tipLocal.set(impactLocal.x - 0.78, impactLocal.y + 0.42, FACE_Z + 0.62)
      tipLocal.x -= 2.6 * (1 - nozIn) + 2.6 * nozOut
      tipLocal.y += 0.8 * (1 - nozIn) + 1.2 * nozOut
      dirLocal.subVectors(impactLocal, tipLocal).normalize()
      nozzle.position.copy(tipLocal)
      nozzle.quaternion.setFromUnitVectors(NOZ_AXIS, dirLocal)
      nozzle.visible = nozVis > 0.002
      spray.u.uFrom.value.copy(tipLocal).addScaledVector(dirLocal, 0.005)
      spray.u.uTo.value.copy(impactLocal)
      spray.u.uTime.value = rm ? t * 0.15 : t
      spray.u.uIntensity.value = blasting * (rm ? 0.7 : 1)
      spray.u.uSize.value = (mobileSize(frame) ? 2.6 : 2.6) * (ctx.renderer.getPixelRatio() || 1)
      spray.points.visible = blasting > 0.002
      impact.mesh.position.copy(impactLocal)
      impact.u.uIntensity.value = blasting * (rm ? 0.8 : 0.85 + 0.15 * Math.sin(t * 9.0) * Math.sin(t * 5.3))
      impact.mesh.visible = blasting > 0.002

      // ================= the frost itself: glow while blasting, swelling when finished
      const frosted = smoothstep(BLAST[0], BLAST[0] + 0.02, local)
      const finished = smoothstep(LIFT[0], POLISH[0] + 0.03, local)
      pane.u.uGlow.value = frosted * lerp(0.27, 0.36, finished) + 0.03 * results
      pane.u.uRim.value = 0.95 * smoothstep(LIFT[0] + 0.015, LIFT[1] + 0.01, local)
      pane.u.uFrostR.value = 0.5

      // ================= 04 SUPPORT: polish — a glint glides round the bevel
      const polU = segment(local, POLISH[0], POLISH[1])
      pane.su.uSweep.value = Math.PI * 0.62 - ease.inOutQuad(polU) * Math.PI * 2
      pane.su.uGlint.value = window01(local, POLISH[0], POLISH[1] + 0.01, 0.02) * (rm ? 0.6 : 1)
      pane.sides.envMapIntensity = 1.15 + 0.35 * window01(local, POLISH[0], 0.95, 0.04)

      // the turntable: square to the film and the cut, turned to the nozzle, a slow
      // quarter-turn under the polish, square again for the results
      let yaw = 0
      yaw += 0.16 * ease.inOutCubic(segment(local, 0.44, 0.5))
      yaw += -0.16 * ease.inOutCubic(segment(local, 0.6, 0.65))
      yaw += 0.26 * Math.sin(Math.PI * ease.inOutQuad(segment(local, 0.63, 0.83)))
      turn.rotation.y = yaw + (rm ? 0 : Math.sin(t * 0.3) * 0.012)
      paneG.visible = local > 0.2

      // light behind the pane: a soft card with a crisp slit
      // the glow behind drops as the frost takes over (clear glass then reads dark and see-through)
      card.u.uIntensity.value = lerp(lerp(0.72, 0.46, frosted), 0.3, finished) * smoothstep(0.24, 0.32, local)
      card.u.uSlit.value = lerp(1, 0.7, results)
      panePool.u.uIntensity.value = lerp(0.3, 0.55, finished)

      // ---- world: black, the halo behind the subject
      const w = ctx.world.params
      const atPane = smoothstep(0.25, 0.32, local)
      w.halo = lerp(0.82, 0.72, atPane) - 0.14 * finished
      w.haloSize = (lerp(0.72, 1.0, atPane) + 0.1 * results) * (portrait ? 0.85 : 1)
      w.slits = lerp(0.32, 0.18, atPane)
      w.env = 1.1
      let envTurn = 0.2 + 0.5 * scanE
      envTurn += 0.6 * ease.inOutCubic(segment(local, 0.26, 0.4))
      envTurn += 2.2 * ease.inOutQuad(polU)
      envTurn += 0.25 * results
      w.envTurn = rm ? 0.2 + (envTurn - 0.2) * 0.3 : envTurn
      w.keyDir.set(lerp(0.12, -0.45, atPane), 1, lerp(0.18, 0.5, atPane))
      w.key = 1.7
      w.fill = 0.08

      // ---- post
      const post = ctx.post.params
      post.bloomStrength = 0.42
      post.bloomRadius = 0.35
      post.vignette = 0.55

      // ---- DOM
      reveal(head, window01(local, HEAD[0], HEAD[1], 0.03), 0)
      setRise(headline, local > HEAD[0] + 0.005 && local < HEAD[1] - 0.01)
      const cardV = window01(local, CARD[0], CARD[1], 0.018)
      reveal(cardEl, cardV, 0)
      const cur = local > CARD[0] && local < CARD[1] ? idx : -1
      if (cur !== shown) {
        shown = cur
        stepEls.forEach((s, i) => s.classList.toggle('is-on', i === cur))
        segs.forEach((s, i) => {
          s.classList.toggle('is-on', i === cur)
          s.classList.toggle('is-done', cur >= 0 && i < cur)
        })
      }
      for (let i = 0; i < stepTitles.length; i++) setRise(stepTitles[i], i === cur && cardV > 0.05)
      for (let i = 0; i < 4; i++) {
        const f = i < idx ? 1 : i === idx ? (inSteps ? ease.outCubic(clamp(phase / 0.6)) : local > B ? 1 : 0) : 0
        const q = Math.round(f * 1000)
        if (fillCache[i] !== q) {
          fillCache[i] = q
          fills[i].style.transform = `scaleX(${(q / 1000).toFixed(3)})`
        }
      }
      reveal(statsEl, window01(local, TILES[0] - 0.01, TILES[1] + 0.005, 0.02), 0)
      const tilesOn = local > TILES[0] && local < TILES[1]
      if (tilesOn !== tilesShown) {
        tilesShown = tilesOn
        for (const tile of tiles) tile.classList.toggle('is-on', tilesOn)
      }
    },

    camera(local: number, frame: Frame, out: CameraPose) {
      const aspect = frame.width / Math.max(1, frame.height)
      if (Math.abs(aspect - keysAspect) > 1e-3 || fitDirty) {
        keys = keysFor(aspect, fit)
        keysAspect = aspect
        fitDirty = false
      }
      const fov = sample(keys, local, tmpPos, tmpTgt, tmpFocus)
      // a slow breath in the pose (idle only)
      if (!frame.reducedMotion && !frame.still) tmpPos.y += Math.sin(frame.time * 0.35) * 0.03
      out.position.copy(tmpPos)
      out.target.copy(tmpTgt)
      out.fov = fov
      out.roll = 0
      out.parallax = frame.reducedMotion ? 0 : 0.22

      // put the backlight halo behind the subject
      if (ctxRef) {
        scratch.position.copy(tmpPos)
        scratch.fov = fov
        scratch.aspect = aspect
        scratch.updateProjectionMatrix()
        scratch.lookAt(tmpTgt)
        scratch.updateMatrixWorld()
        tmpFocus.y += 0.1
        tmpFocus.project(scratch)
        if (Number.isFinite(tmpFocus.x) && Number.isFinite(tmpFocus.y)) {
          ctxRef.world.params.focus.set(clamp(tmpFocus.x, -1.2, 1.2) * aspect, clamp(tmpFocus.y, -0.9, 0.9))
        }
      }
    },
  }
}

const mobileSize = (frame: Frame) => frame.mobile || frame.width < 768
