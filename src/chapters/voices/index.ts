import * as THREE from 'three'
import type { CameraPose, Chapter, ChapterContext, Frame } from '../../core/types'
import { el, rise, setRise } from '../../core/dom'
import { clamp, lerp, rng, smoothstep } from '../../core/math'
import { nextFrame } from '../../core/yield'
import { SECTIONS, TESTIMONIALS } from '../../content'
import { makePane, PH, PW, REGION, type Pane } from './breath'
import { buildMaskIdle, hasMask, nameMask, preloadScriptFonts, scriptFontsReady, resetMasks } from './script'
import { whenRevealed } from '../../kit/images'
import './voices.css'

// the hand starts downloading while the chapters before this one initialise
void preloadScriptFonts()

/*
 * BREATH (voices) — one large sheet of cold glass in the black room, fogged
 * with condensation and lit from behind. For each client, a fingertip writes
 * their NAME into the fog (and the company, smaller), stroke by stroke with
 * the scroll: the backlight shines through the clear strokes, a drip or two
 * runs from the baseline, then the fog re-forms for the next voice. The quote
 * itself is DOM, in a frosted panel.
 *
 *   0.00–0.09  intro: condensation blooms across the clear pane (a breath);
 *              “We listen. They talk.” — and the finger has already begun
 *              the first name (it starts at V0, so the landing finds it
 *              half-written)
 *   0.09–0.93  eight voices (0.105 each): write the name → the company →
 *              hold (drips run, the light sweeps along the edges) → re-fog
 *   0.93–1.00  the whole pane fogs over, heavy and white, for the cut
 *
 * Everything is derived from `local`; frame.time only drives idle float.
 */

const N = TESTIMONIALS.length
const B0 = 0.09
const B1 = 0.93
const SPAN = (B1 - B0) / N
const HYST = 0.005
/** the first voice's writing begins in the intro */
const V0 = 0.043
/** inside a voice (phase 0..1) */
const WRITE_A = 0.025
const WRITE_B = 0.47
const CO_A = 0.44
const CO_B = 0.62
const REFOG_A = 0.88
const REFOG_B = 0.995
/** drip trail half-width where it leaves the stroke (world units) */
const DRIP_W = 0.026


/** writing pace: a little slower into and out of the stroke, steady between */
const pace = (t: number) => {
  const x = clamp(t)
  return 0.55 * x + 0.45 * x * x * (3 - 2 * x)
}
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3)
const easeInOut = (t: number) => {
  const x = clamp(t)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

interface Layout {
  w: number
  h: number
  portrait: boolean
  /** px rects (x0, y0, x1, y1) for the pane: while the quotes show / in the intro */
  beat: [number, number, number, number]
  intro: [number, number, number, number]
}

export default function create(): Chapter {
  const group = new THREE.Group()
  let pane: Pane
  const cam = new THREE.Vector3()
  const tmp = new THREE.Vector3()

  // per-voice drip lengths (stable)
  const rand = rng(29)
  const dripLen = TESTIMONIALS.map(() => [0.42 + rand() * 0.4, 0.3 + rand() * 0.38])

  // DOM
  let intro: HTMLElement
  let introTitle: HTMLElement
  let panel: HTMLElement
  let stack: HTMLElement
  let count: HTMLElement
  let ticks: HTMLElement[] = []
  const cards: { root: HTMLElement; parts: HTMLElement[]; h: number }[] = []
  let shown = -2 // -2 fresh, -1 intro, 0..N-1 voice, N out
  let stackH = -1
  let deferShow = 0
  const lay: Layout = { w: 0, h: 0, portrait: false, beat: [0, 0, 1, 1], intro: [0, 0, 1, 1] }
  let measured = false
  let currentMask = -1
  /** the engine has entered this chapter (prewarm updates it without entering) */
  let entered = false
  let dripU: THREE.Vector4[] = []
  /** textures from a fallback-font build, disposed once rebound */
  let stale: THREE.Texture[] = []

  /* -------------------------------------------------------------- DOM */

  function buildDom(stage: HTMLElement) {
    intro = el('div', 'vc-intro', undefined, stage)
    el('p', 'hud-eyebrow vc-eyebrow', SECTIONS.voices.eyebrow, intro)
    const m = SECTIONS.voices.title.match(/^(.*?\.)\s+(.*)$/)
    const html = m ? `${m[1]} <em>${m[2]}</em>` : SECTIONS.voices.title
    introTitle = rise(el('h2', 'hud-h2 vc-title', undefined, intro), html)

    panel = el('figure', 'vc-panel hud-panel hud-panel--strong', undefined, stage)
    const meta = el('div', 'vc-meta', undefined, panel)
    count = el('p', 'vc-count', '', meta)
    const tickRow = el('div', 'vc-ticks', undefined, meta)
    ticks = TESTIMONIALS.map(() => el('i', '', undefined, tickRow))
    stack = el('div', 'vc-stack', undefined, panel)
    TESTIMONIALS.forEach(t => {
      const root = el('div', 'vc-card', undefined, stack)
      if (t.quote.length > 170) root.classList.add('vc-card--long')
      const q = rise(el('blockquote', 'hud-quote vc-quote', undefined, root), `“${t.quote}”`)
      const who = el('p', 'vc-who', undefined, root)
      const name = rise(el('span', 'hud-label vc-name', undefined, who), t.name)
      const co = rise(el('span', 'hud-label vc-co', undefined, who), t.company)
      cards.push({ root, parts: [q, name, co], h: 0 })
    })
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(entries => {
        for (const e of entries) {
          const c = cards.find(k => k.root === e.target)
          if (c) c.h = (e.target as HTMLElement).offsetHeight
        }
        applyStackHeight()
        measure(lay.w || undefined, lay.h || undefined)
      })
      cards.forEach(c => ro.observe(c.root))
      ro.observe(intro)
    }
    window.addEventListener('resize', () => measure())
    measure()
  }

  /** where the pane may sit (px), read only on resize / content size changes */
  function measure(fw?: number, fh?: number) {
    const w = fw ?? window.innerWidth
    const h = fh ?? window.innerHeight
    if (!w || !h) return
    // mirrors voices.css @media (max-aspect-ratio: 1/1)
    const portrait = w / h <= 1
    const cs = getComputedStyle(panel)
    const padV = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
    const gap = parseFloat(cs.rowGap) || 0
    const metaH = (panel.firstElementChild as HTMLElement | null)?.offsetHeight ?? 20
    let tallest = 0
    for (const c of cards) tallest = Math.max(tallest, c.h || c.root.offsetHeight)
    const panelH = padV + gap + metaH + tallest
    const panelBottom = panel.offsetTop + panel.offsetHeight || h - 90
    const safeTop = intro.offsetTop || 90
    const safeBottom = h - panelBottom
    const introBottom = intro.offsetTop + intro.offsetHeight
    if (portrait) {
      const gut = Math.max(12, panel.offsetLeft || 16)
      const top = safeTop + 6
      const bottom = panelBottom - panelH - 18
      lay.beat = [gut * 0.5, top, w - gut * 0.5, Math.max(top + 120, bottom)]
      lay.intro = [gut * 0.5, introBottom + 22, w - gut * 0.5, Math.max(introBottom + 140, h - safeBottom - 10)]
    } else {
      const right = panel.offsetLeft + (panel.offsetWidth || 0.36 * w)
      const x0 = right + Math.max(24, 0.025 * w)
      const x1 = w - Math.max(24, 0.03 * w)
      lay.beat = [x0, safeTop - 10, x1, h - safeBottom + 10]
      lay.intro = lay.beat
    }
    lay.w = w
    lay.h = h
    lay.portrait = portrait
    measured = true
  }

  function applyStackHeight(snap = false) {
    if (shown < 0 || shown >= N) return
    const c = cards[shown]
    const hh = c.h || (c.h = c.root.offsetHeight)
    if (hh && hh !== stackH) {
      stackH = hh
      if (snap) stack.style.transition = 'none'
      stack.style.height = `${hh}px`
      if (snap) {
        void stack.offsetHeight
        stack.style.transition = ''
      }
    }
  }

  function setCard(i: number, on: boolean) {
    const c = cards[i]
    if (!c) return
    c.root.classList.toggle('is-on', on)
    for (const p of c.parts) setRise(p, on)
  }

  function sinkAll() {
    for (let i = 0; i < N; i++) setCard(i, false)
    setRise(introTitle, false)
    intro.classList.remove('is-on')
    panel.classList.remove('is-on')
    shown = -2
    stackH = -1
  }

  function wantAt(local: number) {
    let want = local < B0 ? -1 : local >= B1 ? N : Math.min(N - 1, Math.floor((local - B0) / SPAN))
    if (shown >= -1 && want !== shown && Math.abs(want - shown) === 1) {
      const hi = Math.max(want, shown)
      const boundary = hi >= N ? B1 : B0 + hi * SPAN
      if (Math.abs(local - boundary) < HYST) want = shown
    }
    return want
  }

  function show(next: number) {
    if (next === shown) return
    const wasCard = shown >= 0 && shown < N
    if (wasCard) setCard(shown, false)
    shown = next
    const isCard = next >= 0 && next < N
    panel.classList.toggle('is-on', isCard)
    if (isCard) {
      setCard(next, true)
      count.innerHTML = `<b>${String(next + 1).padStart(2, '0')}</b> / ${String(N).padStart(2, '0')}`
      ticks.forEach((d, i) => {
        d.classList.toggle('is-on', i === next)
        d.classList.toggle('is-past', i < next)
      })
      applyStackHeight(!wasCard)
    }
  }

  /* ---------------------------------------------------------- timeline */

  /** which voice's writing is on the glass, and where it is in its beat */
  function voiceAt(local: number) {
    // the first voice runs from V0 (in the intro) to the end of its slot
    if (local < B0 + SPAN) return { i: 0, p: clamp((local - V0) / (B0 + SPAN - V0)), active: local >= V0 }
    const i = Math.min(N - 1, Math.max(0, Math.floor((local - B0) / SPAN)))
    const p = local < B0 ? 0 : local >= B1 ? 1 : clamp((local - B0 - i * SPAN) / SPAN)
    return { i, p, active: local >= B0 && local < B1 }
  }

  /* ------------------------------------------------------------ camera */

  const FOV_L = 30
  const FOV_P = 38

  /** camera that frames the pane (at the origin) centred in rect r, fill 0..1 */
  function frameRect(r: [number, number, number, number], f: Frame, fill: number, outPos: THREE.Vector3, outTgt: THREE.Vector3) {
    const W = f.width
    const H = f.height
    const aspect = W / Math.max(1, H)
    const fov = lay.portrait ? FOV_P : FOV_L
    const tanV = Math.tan(THREE.MathUtils.degToRad(fov / 2))
    const rw = Math.max(80, r[2] - r[0])
    const rh = Math.max(80, r[3] - r[1])
    const paneWpx = Math.min(rw * fill, rh * fill * (PW / PH))
    const D = (PW * H) / (2 * tanV * paneWpx)
    const cx = ((r[0] + r[2]) / 2 / W) * 2 - 1
    const cy = 1 - ((r[1] + r[3]) / 2 / H) * 2
    const ox = -cx * D * tanV * aspect
    const oy = -cy * D * tanV
    outPos.set(ox, oy, D)
    outTgt.set(ox, oy, 0)
    return fov
  }

  const pA = new THREE.Vector3()
  const tA = new THREE.Vector3()
  const pB = new THREE.Vector3()
  const tB = new THREE.Vector3()
  const introPos = new THREE.Vector3()
  const introTgt = new THREE.Vector3()

  /* ----------------------------------------------------------- chapter */

  return {
    id: 'voices',
    group,
    // keyboard stops land on each voice once the name is written and the quote is sharp
    anchors: TESTIMONIALS.map((_, i) => B0 + SPAN * (i + 0.7)),

    async init(ctx: ChapterContext) {
      buildDom(ctx.stage)
      pane = makePane(ctx.mobile)
      dripU = [pane.u.uDrip0.value, pane.u.uDrip1.value]
      group.add(pane.root)
      await nextFrame()
      const fontsOk = await scriptFontsReady(2500)
      // the first voice now (the landing shows it half-written); the rest
      // after the reveal, a phase per frame, so they never hold up the boot.
      // A jump that lands on a voice first builds that one on the spot.
      await buildMaskIdle(0)
      whenRevealed().then(async () => {
        if (!fontsOk && (await scriptFontsReady(15000))) {
          // the hand arrived late: redo the fallback build
          stale = resetMasks()
          currentMask = -1
        }
        for (let i = 0; i < N; i++) await buildMaskIdle(i)
      })
    },

    onEnter() {
      entered = true
      sinkAll()
      deferShow = 1
      if (!measured) measure()
    },

    onLeave() {
      entered = false
      sinkAll()
    },

    update(local, frame, ctx) {
      const rm = frame.reducedMotion || !!frame.still
      const u = pane.u
      const v = voiceAt(local)
      const p = v.p

      /* ---- the writing ---- */
      // (the boot prewarm updates without entering: it compiles with any built
      // mask rather than building one on the spot)
      const mi = entered || hasMask(v.i) ? v.i : hasMask(currentMask) ? currentMask : 0
      if (mi !== currentMask) {
        const m = nameMask(mi)
        currentMask = mi
        u.uMask.value = m.tex
        u.uCapN.value = m.capName
        u.uCapC.value = m.capCo
        u.uHasMask.value = 1
        dripU.forEach((d, k) => {
          const s = m.drips[k]
          if (!s) d.set(0, 0, 0, DRIP_W)
          else d.set(REGION.x + (s.u - 0.5) * REGION.w, REGION.y + (s.v - 0.5) * REGION.h, 0, DRIP_W)
        })
        if (stale.length) {
          for (const t of stale) t.dispose()
          stale = []
        }
      }
      const m = nameMask(mi)
      const write = v.active ? pace((p - WRITE_A) / (WRITE_B - WRITE_A)) : local >= B1 ? 1 : 0
      const coWrite = v.active ? pace((p - CO_A) / (CO_B - CO_A)) : local >= B1 ? 1 : 0
      const refog = v.active ? pace((p - REFOG_A) / (REFOG_B - REFOG_A)) : local >= B1 ? 1 : 0
      u.uWrite.value = write
      u.uCoWrite.value = coWrite
      u.uRefog.value = refog
      // drips start once the finger has passed their glyph, and run until the fog returns
      dripU.forEach((d, k) => {
        const s = m.drips[k]
        if (!s) {
          d.z = 0
          return
        }
        const start = WRITE_A + s.t * (WRITE_B - WRITE_A) + 0.06 + k * 0.05
        const run = clamp((p - start) / (REFOG_A + 0.08 - start))
        d.z = v.active ? Math.min(dripLen[v.i][k], s.max * REGION.h) * easeOut(run) * (0.35 + 0.65 * run) : 0
      })

      /* ---- the breath: condensation blooms over the clear pane ---- */
      const bloom = easeOut(clamp((local - 0.008) / 0.06))
      u.uBloom.value = lerp(0.2, 5.4, bloom)
      // between voices a fresh breath thickens the fog for a moment
      let breath = 0
      for (let k = 1; k < N; k++) {
        const d = (local - (B0 + k * SPAN)) / (SPAN * 0.16)
        breath = Math.max(breath, Math.exp(-d * d))
      }
      const out = smoothstep(B1, 0.99, local)
      u.uHeavy.value = Math.max(out, (rm ? 0.08 : 0.2) * breath)

      /* ---- the light behind ---- */
      const written = v.active ? smoothstep(WRITE_A, WRITE_B, p) * (1 - smoothstep(REFOG_A, REFOG_B, p)) : 0
      const idle = rm ? 0 : Math.sin(frame.time * 0.5) * 0.015
      u.uLight.value = (0.9 + 0.12 * written + idle) * lerp(1, 0.78, out)
      // a crisp light sweep across the glass while the name is on it
      const sweepT = clamp((p - 0.1) / 0.72)
      u.uSweep.value = v.active ? lerp(-4.2, 4.6, sweepT) : -9
      u.uSweepK.value = v.active ? Math.sin(Math.PI * sweepT) : 0

      /* ---- the pane: a slow turntable ---- */
      const drift = local < B0 ? 0 : clamp((local - B0) / (B1 - B0))
      const yaw = lay.portrait ? lerp(-0.12, 0.1, drift) : lerp(-0.2, 0.06, drift)
      pane.root.rotation.set(-0.02, yaw + (rm ? 0 : Math.sin(frame.time * 0.21) * 0.008), 0)
      pane.root.position.y = rm ? 0 : Math.sin(frame.time * 0.33) * 0.02
      pane.root.updateMatrixWorld()
      cam.copy(ctx.camera.position)
      pane.face.worldToLocal(cam)
      u.uCam.value.copy(cam)

      /* ---- world + post ---- */
      const w = ctx.world.params
      w.top = '#010102'
      w.bottom = '#000000'
      // the halo stands behind the pane: a faint aura around its edges
      tmp.set(0, REGION.y, 0).applyMatrix4(pane.root.matrixWorld).project(ctx.camera)
      const aspect = frame.width / Math.max(1, frame.height)
      if (Number.isFinite(tmp.x) && Number.isFinite(tmp.y)) w.focus.set(tmp.x * aspect, tmp.y)
      w.halo = (lay.portrait ? 0.22 : 0.32) * (1 + 0.3 * written) * lerp(1, 0.7, out)
      w.haloSize = lay.portrait ? 0.95 : 1.2
      w.haloColor = '#e6eeff'
      w.slits = 0
      w.env = 1.1
      // light glides along the polished edges, one slow pass per voice
      w.envTurn = 0.6 + (v.active ? v.i + easeInOut(p) : local >= B1 ? N : 0) * 0.62
      w.key = 1.3
      w.keyDir.set(-0.4, 0.8, 0.45)
      w.fill = 0.04
      const post = ctx.post.params
      post.vignette = 0.62
      // no bloom: nothing here but the sweep's hairline crosses the threshold
      // (≈0.2% of pixels); the fog shader draws its soft glint itself
      post.bloomStrength = 0
      post.bloomRadius = 0.35
      post.grain = 0.02

      /* ---- DOM ---- */
      if (deferShow > 0) {
        deferShow--
        return
      }
      show(wantAt(local))
      setRise(introTitle, shown === -1 && local > 0.012)
      intro.classList.toggle('is-on', shown === -1)
    },

    camera(local: number, frame: Frame, out: CameraPose) {
      if (!measured || lay.w !== frame.width || lay.h !== frame.height) measure(frame.width, frame.height)
      const rm = frame.reducedMotion || !!frame.still
      const v = voiceAt(local)
      const fill = lay.portrait ? 1.04 : 0.92
      const fov = frameRect(lay.beat, frame, fill, pB, tB)
      // intro: from a closer look along the upper-left edge back to the framed pane
      frameRect(lay.intro, frame, fill, pA, tA)
      const settle = easeInOut(clamp(local / 0.075))
      introPos.copy(pA).sub(tA).multiplyScalar(0.55).add(tA).add(tmp.set(-PW * 0.2, PH * 0.14, 0))
      introTgt.copy(tA).add(tmp.set(-PW * 0.24, PH * 0.12, 0))
      introPos.lerp(pA, settle)
      introTgt.lerp(tA, settle)
      // intro → the first voice's framing (portrait moves up under the chrome)
      const toBeat = easeInOut(clamp((local - (B0 - 0.012)) / 0.05))
      out.position.lerpVectors(introPos, pB, toBeat)
      out.target.lerpVectors(introTgt, tB, toBeat)
      // a slow push-in while each name is on the glass, easing back as it fogs
      const push = v.active ? Math.sin(Math.PI * clamp(v.p)) * 0.045 : 0
      const outBeat = smoothstep(B1, 1, local)
      const k = 1 - push + outBeat * 0.08
      out.position.sub(out.target).multiplyScalar(k).add(out.target)
      if (!rm) {
        out.position.x += Math.sin(frame.time * 0.17) * 0.03
        out.position.y += Math.sin(frame.time * 0.23) * 0.02
      }
      out.fov = fov
      out.roll = 0
      out.parallax = rm ? 0 : 0.22
    },
  }
}
