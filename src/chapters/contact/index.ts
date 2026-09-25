import * as THREE from 'three'
import type { Chapter, ChapterContext } from '../../core/types'
import { el, reveal, rise, setRise } from '../../core/dom'
import { clamp, damp, ease, lerp, segment, smoothstep } from '../../core/math'
import { nextFrame } from '../../core/yield'
import { BRAND } from '../../content'
import { G } from '../../kit/glass'
import { buildHud, measureHud, type Hud, type HudLayout } from './hud'
import { buildScene, SLIT_DEPTH, THAW_OUTER, type ThawScene } from './scene'
import './contact.css'

/*
 * CONTACT · "Thaw" — the final chapter, the resolution of the whole site.
 *
 * The super-sharp frosted Hark mark returns, large, beside the contact card,
 * glowing like a backlit sandblasted sign on black. As you scroll, its frost
 * THAWS from the centre outward: a noise-edged front with a thin melt line
 * of light travels across the face, and behind it the glass is crystal clear,
 * refracting the backlight halo and the hairline slits, its polished bevels
 * razor sharp. Then one last breath: frost re-forms from the mark's edges
 * inward, a haze running ahead of a fine crystalline front, until the mark
 * is the landing's sandblast again, the sharpest frosted mark on black, with
 * the sign-off set beneath it. The site ends on the frost.
 *
 *   0.00–0.06  the breath cut clears; the frosted mark turning in at 3/4
 *   0.06–0.30  it turns toward you, the halo swells, the card comes into focus
 *   0.30       landing / heading stop: frosted mark + settled card and CTA
 *   0.31–0.64  THE THAW: centre outward, the melt line riding the front
 *   0.45–0.64  the halo and slits come through the clearing glass
 *   0.64–0.72  crystal: the clear mark bends the slits
 *   0.72–0.90  THE LAST BREATH: frost re-forms from the edges inward; the mark
 *              turns back toward you and makes room for the sign-off, which
 *              comes into focus beneath it (0.82–0.90)
 *   0.90–1.00  the final still: nothing moves
 *
 * Everything is derived from `local`; frame.time only adds a tiny idle float
 * that is off under reduced motion / Motion off and dies for the finale.
 */

const FOV = 30
const DIST = 10
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2))

/** where the thaw runs (local) */
const THAW_A = 0.31
const THAW_B = 0.64
/** where the last breath re-frosts the mark (local) */
const FROST_A = 0.72
const FROST_B = 0.9
/** where the mark makes room for the sign-off */
const ROOM_A = 0.74
const ROOM_B = 0.9
/** half the mark's on-screen height, in mark units (bevel + turn included) */
const HALF = 0.56

export default function create(): Chapter {
  const group = new THREE.Group()
  let hud: Hud
  let set: ThawScene
  let sign: HTMLElement
  let lay: HudLayout | null = null
  let lastW = 0
  let lastH = 0
  // the mark's frame, in px: centre + height (the chapter's pose), and the
  // finale's (mark + sign-off as one group)
  let cx = 0
  let cy = 0
  let unitPx = 200
  let cyF = 0
  let unitF = 200
  let signW = 0
  let signH = 0
  let signGap = 16
  let showSign = false
  let signX = NaN
  let signY = NaN
  let hoverAmt = 0
  let idleAmt = 0
  const shortLandscape = () => matchMedia('(orientation: landscape) and (max-height: 500px)').matches

  const relayout = (W: number, H: number) => {
    lay = measureHud(hud, W, H, !shortLandscape())
    hud.dirty = false
    lastW = W
    lastH = H
    const a = lay.art
    const aw = Math.max(40, a.x1 - a.x0)
    const ah = Math.max(40, a.y1 - a.y0)
    if (!lay.portrait) {
      unitPx = Math.min(ah * 0.66, aw * 0.62)
      cx = (a.x0 + a.x1) / 2
      cy = (a.y0 + a.y1) / 2 - ah * 0.02
    } else {
      unitPx = Math.min(ah * 0.8, aw * 0.56)
      cx = (a.x0 + a.x1) / 2
      cy = (a.y0 + a.y1) / 2
    }

    // the sign-off: display type (hud-h2), stepped down only to fit the art
    // width (and, beside the card, to sit under the mark as one lockup rather
    // than outshout the card's headline)
    sign.style.fontSize = ''
    let w = sign.offsetWidth
    const maxW = lay.portrait ? aw * 0.94 : Math.min(aw * 0.84, unitPx * 1.2)
    let fs = parseFloat(getComputedStyle(sign).fontSize) || 32
    if (w > maxW) {
      fs = Math.floor(((fs * maxW) / w) * 10) / 10
      sign.style.fontSize = `${fs}px`
      w = sign.offsetWidth
    }
    signW = w
    signH = sign.offsetHeight
    showSign = signH > 0 && fs >= 17

    // the finale: mark + sign-off as one group, centred in the art area
    unitF = unitPx
    cyF = cy
    if (showSign) {
      signGap = clamp(unitPx * 0.07, 10, 30)
      const room = ah * (lay.portrait ? 0.95 : 0.92) - signH - signGap
      unitF = Math.min(unitPx, room / (2 * HALF))
      const groupH = unitF * 2 * HALF + signGap + signH
      cyF = a.y0 + (ah - groupH) / 2 + unitF * HALF
    }
  }

  /** camera distance for this local (a slow, weighty push-in) */
  const distFor = (local: number) => DIST * (1.06 - 0.06 * ease.outCubic(clamp(local / 0.88)))

  return {
    id: 'contact',
    group,
    anchors: [0.3],

    async init(ctx: ChapterContext) {
      hud = buildHud(ctx.stage)
      // the sign-off, set like the hero's headline: gradient italic on the last word
      const words = BRAND.tagline.split(' ')
      const last = words.pop() ?? ''
      sign = rise(el('p', 'hud-h2 ct-sign', undefined, ctx.stage), `${words.join(' ')} <em>${last}</em>`)
      sign.setAttribute('aria-hidden', 'true')
      await nextFrame()
      set = buildScene()
      group.add(set.rig)
      await nextFrame()
    },

    update(local, frame, ctx) {
      const W = frame.width
      const H = frame.height
      if (hud.dirty || W !== lastW || H !== lastH || !lay) relayout(W, H)

      const t = frame.time
      // calm (reduced motion / Motion off): no idle float at all
      const calm = ctx.reducedMotion || frame.reducedMotion || !!frame.still
      idleAmt = damp(idleAmt, calm ? 0 : 1 - smoothstep(0.66, 0.84, local), 4, frame.dt)
      const idle = idleAmt < 1e-3 ? 0 : idleAmt

      // ---- the mark's frame: the chapter pose, easing into the finale group
      const room = ease.inOutCubic(segment(local, ROOM_A, ROOM_B))
      const unit = lerp(unitPx, unitF, room)
      const mcy = lerp(cy, cyF, room)

      // ---- place the rig where the card leaves room
      const D = distFor(local)
      const wpp = (2 * D * TAN) / H
      const rig = set.rig
      const S = unit * wpp
      rig.position.set((cx - W / 2) * wpp, (H / 2 - mcy) * wpp, 0)
      rig.scale.setScalar(S)
      // the slit plane: centred on the mark as seen from the camera, 1 unit = 1 mark height
      const back = (D + SLIT_DEPTH * S) / D
      set.slits.position.set((rig.position.x * SLIT_DEPTH) / D, (rig.position.y * SLIT_DEPTH) / D, -SLIT_DEPTH)
      set.slits.scale.setScalar(back)

      // ---- the mark: a slow turntable (a touch past front-on while clear, so
      // the clear faces bend the slits; back toward you for the frosted
      // finale), plus an idle float that dies for the still
      const arrive = ease.outCubic(clamp(local / 0.32))
      const turn = ease.inOutCubic(segment(local, 0.3, 0.7))
      const home = ease.inOutCubic(segment(local, FROST_A, FROST_B))
      const yaw = lerp(-0.62, -0.12, arrive) + 0.24 * turn - 0.2 * home
      const tilt = lerp(0.1, 0.0, arrive) - 0.03 * turn + 0.015 * home
      // "front-on" = facing the camera: undo the off-axis view angle of the art area
      const faceY = -Math.atan2(rig.position.x, D)
      const faceX = Math.atan2(rig.position.y, D)
      set.turn.rotation.set(
        faceX + tilt + 0.02 * Math.sin(t * 0.23) * idle,
        faceY + yaw + 0.035 * Math.sin(t * 0.29 + 0.6) * idle,
        0.008 * Math.sin(t * 0.19) * idle,
      )
      set.turn.position.set(0, 0.012 * Math.sin(t * 0.5) * idle, lerp(-0.35, 0, arrive))

      // ---- THE THAW (centre outward)
      const th = segment(local, THAW_A, THAW_B)
      const thE = th * th * (3 - 2 * th) * 0.55 + th * 0.45
      const u = set.thaw
      u.uThaw.value = lerp(-0.06, THAW_OUTER, thE)
      const melt = smoothstep(THAW_A, THAW_A + 0.04, local) * (1 - smoothstep(THAW_B - 0.06, THAW_B, local))
      u.uMelt.value = 2.4 * melt

      // ---- THE LAST BREATH (edges inward): the front starts beyond the haze's
      // reach and ends past the centre, so the caps finish exactly frosted
      const fr = segment(local, FROST_A, FROST_B)
      const frE = fr * fr * (3 - 2 * fr) * 0.6 + fr * 0.4
      u.uFrost.value = lerp(THAW_OUTER + u.uHaze.value + 0.1, -0.14, frE)
      const rime = smoothstep(FROST_A, FROST_A + 0.035, local) * (1 - smoothstep(FROST_B - 0.06, FROST_B - 0.01, local))
      u.uRime.value = 0.42 * rime
      // the re-formed frost is fresh and dense: it gathers a little more light
      // than the landing's, so the finale is the brightest, sharpest mark
      u.uGain.value = 2.3 + 0.5 * home

      // the address answers: the halo swells while it's hovered, a soft breath on copy
      const hoverTo = hud.hover ? 1 : 0
      hoverAmt = damp(hoverAmt, hoverTo, 5, frame.dt)
      const since = (performance.now() - hud.copiedAt) / 1000
      const copied = since >= 0 && since < 1.6 ? Math.sin((since / 1.6) * Math.PI) : 0
      // Motion off holds a still frame: keep drawing while these settle
      if (copied > 0 || Math.abs(hoverAmt - hoverTo) > 0.004) window.__hark?.engine?.wake()

      // ---- the world: black, one backlight halo behind the mark, hairline slits
      const wp = ctx.world.params
      const aspect = W / H
      const mx = ((cx / W) * 2 - 1) * aspect
      const my = 1 - (mcy / H) * 2
      const unitField = (unit / H) * 2
      const clear = smoothstep(0.45, 0.64, local) * (1 - smoothstep(FROST_A, 0.86, local))
      wp.top = '#020203'
      wp.bottom = '#000000'
      wp.focus.set(mx, my)
      wp.haloSize = unitField * 0.95
      wp.haloColor = G.ice
      wp.halo = 0.55 + 0.45 * smoothstep(0.02, 0.24, local) + 0.25 * clear - 0.08 * home + 0.12 * hoverAmt + 0.18 * copied
      wp.slits = 0
      set.slitU.uStrength.value = 0.55 + 0.35 * clear
      wp.slitAngle = 0
      wp.env = 1.1
      // light sweeps: one glides along the bevels through the thaw, one more
      // as the frost closes; both are done before the still
      wp.envTurn = -0.55 + 0.75 * turn + 0.3 * home
      wp.keyDir.set(-0.4, 0.75, 0.55)
      wp.key = 1.2
      wp.fill = 0.08

      // ---- post: bloom only where a line of light crosses its threshold
      // (the melt line, the rime); the frosted and clear stills gain nothing
      const pp = ctx.post.params
      pp.bloomStrength = 0.22 * Math.max(melt, rime)
      pp.bloomRadius = 0.35
      pp.vignette = 0.55

      // ---- copy
      reveal(hud.panel, smoothstep(0.08, 0.17, local))
      setRise(hud.title, local > 0.1)

      // ---- the sign-off beneath the re-frosted mark (every layout that has room)
      const sv = showSign ? smoothstep(0.82, 0.9, local) : 0
      const sy = mcy + unit * HALF + signGap
      const gap = set.slitU.uGap.value
      if (sv > 0.001) {
        const x = Math.round(cx - signW / 2)
        const y = Math.round(sy + (1 - sv) * 10)
        // written only when it moves a whole pixel (no per-frame strings once still)
        if (x !== signX || y !== signY) {
          signX = x
          signY = y
          sign.style.transform = `translate3d(${x}px, ${y}px, 0)`
        }
        // the slits part around it (plane y is up, screen y is down)
        const gy = -(sy + signH / 2 - mcy) / unit
        const gh = ((signH / 2 + 8) * sv) / unit
        const gw = (signW / 2 + 24) / unit
        gap.set(-gw, gy - gh, gw, gy + gh)
      } else gap.set(0, 9, 0, 9)
      setRise(sign, sv > 0.2)
      reveal(sign, sv, 0)

      // the slits fade out before the chrome bands, and on portrait before the
      // card (under lowfx the card has no blur, so they'd cut across its copy)
      if (lay) {
        const bottom = lay.portrait ? lay.panel.y0 - 10 : lay.band.y1
        set.slitU.uSpan.value.set(Math.max(0.2, (mcy - lay.band.y0) / unit), Math.max(0.2, (bottom - mcy) / unit))
      }
    },

    camera(local, _frame, out) {
      out.position.set(0, 0, distFor(local))
      out.target.set(0, 0, 0)
      out.fov = FOV
      out.roll = 0
      out.parallax = 0.25
    },
  }
}
