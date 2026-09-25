import * as THREE from 'three'
import type { Chapter, ChapterContext } from '../../core/types'
import { el, reveal, setRise } from '../../core/dom'
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
 * razor sharp. By ~0.86 it is still: the clear mark, the halo, black. One
 * last light sweep glides along its edges.
 *
 *   0.00–0.06  the breath cut clears; the frosted mark turning in at 3/4
 *   0.06–0.30  it turns toward you, the halo swells, the card comes into focus
 *   0.30       landing / heading stop: frosted mark + settled card and CTA
 *   0.31–0.84  THE THAW: centre outward, the melt line riding the front
 *   0.62–0.86  the halo and slits come through the clearing glass
 *   0.86–1.00  the final still; 0.88–0.97 one gentle light sweep
 *
 * Everything is derived from `local`; frame.time only adds idle float/sway
 * that fades out for the final still.
 */

const FOV = 30
const DIST = 10
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2))

/** where the thaw runs (local) */
const THAW_A = 0.31
const THAW_B = 0.84

export default function create(): Chapter {
  const group = new THREE.Group()
  let hud: Hud
  let set: ThawScene
  let sign: HTMLElement
  let lay: HudLayout | null = null
  let lastW = 0
  let lastH = 0
  // the mark's frame, in px: centre + height
  let cx = 0
  let cy = 0
  let unitPx = 200
  let signW = 0
  let hoverAmt = 0
  const shortLandscape = () => matchMedia('(orientation: landscape) and (max-height: 500px)').matches

  const relayout = (W: number, H: number) => {
    lay = measureHud(hud, W, H, !shortLandscape())
    hud.dirty = false
    signW = sign.offsetWidth
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
  }

  /** camera distance for this local (a slow, weighty push-in) */
  const distFor = (local: number) => DIST * (1.06 - 0.06 * ease.outCubic(clamp(local / 0.88)))

  return {
    id: 'contact',
    group,
    anchors: [0.3],

    async init(ctx: ChapterContext) {
      hud = buildHud(ctx.stage)
      sign = el('p', 'ct-sign', BRAND.tagline, ctx.stage)
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
      const settle = smoothstep(0.72, 0.88, local)
      const idle = (frame.reducedMotion ? 0 : 1) * (1 - settle)

      // ---- place the rig where the card leaves room
      const D = distFor(local)
      const wpp = (2 * D * TAN) / H
      const rig = set.rig
      const S = unitPx * wpp
      rig.position.set((cx - W / 2) * wpp, (H / 2 - cy) * wpp, 0)
      rig.scale.setScalar(S)
      // the slit plane: centred on the mark as seen from the camera, 1 unit = 1 mark height
      const back = (D + SLIT_DEPTH * S) / D
      set.slits.position.set((rig.position.x * SLIT_DEPTH) / D / S, (rig.position.y * SLIT_DEPTH) / D / S, -SLIT_DEPTH)
      set.slits.scale.setScalar(back)

      // ---- the mark: a slow turntable that ends a touch past front-on (so the
      // clear faces bend the slits), plus an idle float that dies for the still
      const arrive = ease.outCubic(clamp(local / 0.32))
      const yaw = lerp(-0.62, -0.12, arrive) + 0.24 * ease.inOutCubic(segment(local, 0.3, 0.88))
      const tilt = lerp(0.1, 0.0, arrive) - 0.03 * ease.inOutCubic(segment(local, 0.3, 0.88))
      // "front-on" = facing the camera: undo the off-axis view angle of the art area
      const faceY = -Math.atan2(rig.position.x, D)
      const faceX = Math.atan2(rig.position.y, D)
      set.turn.rotation.set(
        faceX + tilt + 0.02 * Math.sin(t * 0.23) * idle,
        faceY + yaw + 0.035 * Math.sin(t * 0.29 + 0.6) * idle,
        0.008 * Math.sin(t * 0.19) * idle,
      )
      set.turn.position.set(0, 0.012 * Math.sin(t * 0.5) * idle, lerp(-0.35, 0, arrive))

      // ---- THE THAW
      const th = segment(local, THAW_A, THAW_B)
      const thE = th * th * (3 - 2 * th) * 0.55 + th * 0.45
      set.thaw.uThaw.value = lerp(-0.06, THAW_OUTER, thE)
      set.thaw.uMelt.value = 2.4 * smoothstep(THAW_A, THAW_A + 0.05, local) * (1 - smoothstep(THAW_B - 0.07, THAW_B, local))

      // the address answers: the halo swells while it's hovered, a soft breath on copy
      hoverAmt = damp(hoverAmt, hud.hover ? 1 : 0, 5, frame.dt)
      const since = (performance.now() - hud.copiedAt) / 1000
      const copied = since >= 0 && since < 1.6 ? Math.sin((since / 1.6) * Math.PI) : 0

      // ---- the world: black, one backlight halo behind the mark, hairline slits
      const wp = ctx.world.params
      const aspect = W / H
      const mx = ((cx / W) * 2 - 1) * aspect
      const my = 1 - (cy / H) * 2
      const unitField = (unitPx / H) * 2
      wp.top = '#020203'
      wp.bottom = '#000000'
      wp.focus.set(mx, my)
      wp.haloSize = unitField * 0.95
      wp.haloColor = G.ice
      wp.halo = 0.55 + 0.45 * smoothstep(0.02, 0.24, local) + 0.25 * smoothstep(0.55, 0.86, local) + 0.12 * hoverAmt + 0.18 * copied
      wp.slits = 0
      set.slitU.uStrength.value = 0.55 + 0.35 * smoothstep(0.45, 0.86, local)
      wp.slitAngle = 0
      wp.env = 1.1
      // light sweeps: one glides along the bevels during the thaw, one last gentle pass
      wp.envTurn = -0.55 + 0.75 * ease.inOutCubic(segment(local, 0.1, 0.84)) + 0.3 * ease.inOutCubic(segment(local, 0.88, 0.97))
      wp.keyDir.set(-0.4, 0.75, 0.55)
      wp.key = 1.2
      wp.fill = 0.08

      // ---- post
      const pp = ctx.post.params
      pp.bloomStrength = 0.22
      pp.bloomRadius = 0.35
      pp.vignette = 0.55

      // ---- copy
      reveal(hud.panel, smoothstep(0.08, 0.17, local))
      setRise(hud.title, local > 0.1)

      // the sign-off under the clear mark (landscape with room only); the slits part around it
      const showSign = !!lay && !lay.portrait && H > 560
      const sv = showSign ? smoothstep(0.84, 0.9, local) : 0
      const sy = cy + unitPx * 0.56 + 24
      if (sv > 0.001) sign.style.transform = `translate3d(${(cx - signW / 2).toFixed(1)}px, ${(sy + (1 - sv) * 8).toFixed(1)}px, 0)`
      const gap = set.slitU.uGap.value
      if (sv > 0.001) {
        // the gap opens with the sign (plane y is up, screen y is down)
        const gy = -(sy + 8 - cy) / unitPx
        const gh = (20 * sv) / unitPx
        const gw = (signW / 2 + 18) / unitPx
        gap.set(-gw, gy - gh, gw, gy + gh)
      } else gap.set(0, 9, 0, 9)
      if (lay) set.slitU.uSpan.value.set(Math.max(0.2, (cy - lay.band.y0) / unitPx), Math.max(0.2, (lay.band.y1 - cy) / unitPx))
      reveal(sign, sv, 0)
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
