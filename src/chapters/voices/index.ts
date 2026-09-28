import * as THREE from 'three'
import type { CameraPose, Chapter, ChapterContext, Frame } from '../../core/types'
import { el, rise, setRise } from '../../core/dom'
import { clamp, lerp, smoothstep } from '../../core/math'
import { nextFrame } from '../../core/yield'
import { SECTIONS, TESTIMONIALS } from '../../content'
import { buildEngravings, engraveFontsReady, loadEngraveFonts } from './engrave'
import { BASE_D, BASE_W, GLASS_Y1, PH, PW, SLOT_V, buildRow, rowPos, type Row } from './plaques'
import './voices.css'

// the faces start loading while the chapters before this one initialise
void loadEngraveFonts()

/*
 * EDGE-LIT (voices) — a row of thick, clear glass plaques standing on slim
 * dark bases over the black mirror floor, like crystal client awards. Each
 * carries one client's QUOTE, verbatim, as its main text, with the client and
 * company as a small credit beneath, sandblasted into the glass. A light
 * strip in each base shines up into the glass: the clear glass stays almost
 * invisible (only its polished edges catch the studio), the etched strokes
 * catch the light and glow. A slim frosted caption carries the count and the
 * credit; the quotes themselves are in the copy layer for screen readers.
 *
 *   0.00–0.09  intro: the row powers up out of the cut (standby lines come on
 *              along the bases, near to far); “We listen. They talk.” over the
 *              row receding into black (settled 0.06 & 0.08)
 *   0.09–0.93  eight voices (0.105 each): the camera glides along the row to
 *              the next plaque → its base light fades up, the etching ignites
 *              from the base upward → hold (the quote) → it dims as the camera
 *              moves on
 *   0.93–1.00  the last plaque stays lit, the whole row returns to standby,
 *              the camera eases back for the cut
 *
 * Everything is derived from `local`; frame.time only drives idle drift.
 */

const N = TESTIMONIALS.length
const B0 = 0.09
const B1 = 0.93
const SPAN = (B1 - B0) / N
const HYST = 0.005
/** the camera leaves a plaque at this phase of its beat, and arrives at the next one's */
const GLIDE_A = 0.8
const GLIDE_B = 0.14
/** inside a voice (phase 0..1): ignition / dim */
const IGN_A = 0.07
const IGN_B = 0.17
const FRONT_A = 0.1
const FRONT_B = 0.3
const DIM_A = 0.86
const DIM_B = 1.0
/** the intro shot hands over to the first plaque across [INTRO_GO, first arrival] */
const INTRO_GO = 0.077

const easeInOut = (t: number) => {
  const x = clamp(t)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3)
/** 0 → 1 → 0 over x ∈ [-1, 1] */
const bump = (x: number) => {
  const a = clamp(1 - x * x)
  return a * a
}

interface Layout {
  w: number
  h: number
  portrait: boolean
  /** px rects (x0, y0, x1, y1) for the plaque: while the quotes show / in the intro */
  beat: [number, number, number, number]
  intro: [number, number, number, number]
}

/** continuous plaque index the camera is at (holds mid-beat, glides across the boundaries) */
function camIndex(local: number) {
  const u = (local - B0) / SPAN
  let f = 0
  for (let k = 1; k < N; k++) f += easeInOut((u - (k - 1 + GLIDE_A)) / (1 - GLIDE_A + GLIDE_B))
  return f
}

export default function create(): Chapter {
  const group = new THREE.Group()
  let row: Row

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
      // the quote is engraved in the plaque; the caption credits it
      const who = el('p', 'vc-who', undefined, root)
      const name = rise(el('span', 'vc-name', undefined, who), t.name)
      const co = rise(el('span', 'hud-label vc-co', undefined, who), t.company)
      cards.push({ root, parts: [name, co], h: 0 })
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

  /** where the plaque may sit (px), read only on resize / content size changes */
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
      const top = safeTop + 4
      const bottom = panelBottom - panelH - 14
      lay.beat = [gut * 0.5, top, w - gut * 0.5, Math.max(top + 120, bottom)]
      lay.intro = [gut * 0.5, introBottom + 18, w - gut * 0.5, Math.max(introBottom + 160, h - safeBottom - 6)]
    } else {
      const right = panel.offsetLeft + (panel.offsetWidth || 0.36 * w)
      const x0 = right + Math.max(24, 0.025 * w)
      const x1 = w - Math.max(24, 0.03 * w)
      lay.beat = [x0, safeTop - 16, x1, h - safeBottom + 16]
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

  /* ---------------------------------------------------------- lighting */

  /** how lit plaque i is at `local` (0..1), how far its light has climbed, and its strip level */
  function lightAt(i: number, local: number, rm: boolean) {
    const p = (local - B0) / SPAN - i
    let on = smoothstep(IGN_A, IGN_B, p)
    let front = rm ? 1.2 : lerp(0, 1.2, easeOut((p - FRONT_A) / (FRONT_B - FRONT_A)))
    // the last plaque stays lit through the out beat
    const off = i === N - 1 ? 0.25 * smoothstep(0.97, 1, local) : smoothstep(DIM_A, DIM_B, p)
    on *= 1 - off
    if (p >= DIM_A && i < N - 1) front = 1.2
    // one soft stutter as the strip catches (never in reduced motion)
    const stutter = rm ? 0 : 0.45 * bump((p - 0.118) / 0.022)
    return { on, front, strip: on * (1 - stutter) }
  }

  /* ------------------------------------------------------------ camera */

  const FOV_L = 30
  const FOV_P = 36
  /** the viewing direction: a little to the right of the plaques' normal, looking slightly down */
  const YAW = 0.2
  const PITCH = 0.085
  /** the intro looks down the row from its near end */
  const INTRO_YAW = 0.16
  /** subject box (the plaque on its base, a hint of reflection below) */
  const SUBJ_H = GLASS_Y1 + 0.22
  const SUBJ_W = BASE_W
  const SUBJ_CY = GLASS_Y1 / 2 - 0.1

  const fwd = new THREE.Vector3()
  const right = new THREE.Vector3()
  const up = new THREE.Vector3()
  const C = new THREE.Vector3()
  const tmp = new THREE.Vector3()
  const pose = { pos: new THREE.Vector3(0, 1, 8), target: new THREE.Vector3(0, 1, 0), fov: FOV_L }
  const pA = new THREE.Vector3()
  const tA = new THREE.Vector3()
  const pB = new THREE.Vector3()
  const tB = new THREE.Vector3()
  const probe = new THREE.PerspectiveCamera()

  /**
   * Place a camera looking along (yaw, pitch) so the subject centred at `c`
   * (size sw x sh) fills `fill` of rect r and sits at the rect's centre.
   */
  function frame3(
    r: [number, number, number, number],
    W: number,
    H: number,
    fov: number,
    c: THREE.Vector3,
    sw: number,
    sh: number,
    fill: number,
    yaw: number,
    pitch: number,
    k: number,
    outPos: THREE.Vector3,
    outTgt: THREE.Vector3,
  ) {
    const aspect = W / Math.max(1, H)
    const tanV = Math.tan(THREE.MathUtils.degToRad(fov / 2))
    const tanH = tanV * aspect
    const rw = Math.max(80, r[2] - r[0])
    const rh = Math.max(80, r[3] - r[1])
    const D = Math.max(sh / 2 / (tanV * fill * (rh / H)), sw / 2 / (tanH * fill * (rw / W))) * k
    const cx = ((r[0] + r[2]) / W) - 1
    const cy = 1 - ((r[1] + r[3]) / H)
    fwd.set(-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
    right.set(Math.cos(yaw), 0, -Math.sin(yaw))
    up.crossVectors(right, fwd)
    outPos
      .copy(c)
      .addScaledVector(fwd, -D)
      .addScaledVector(right, -cx * tanH * D)
      .addScaledVector(up, -cy * tanV * D)
    outTgt.copy(outPos).addScaledVector(fwd, D)
  }

  function computePose(local: number, frame: Frame) {
    if (!measured || lay.w !== frame.width || lay.h !== frame.height) measure(frame.width, frame.height)
    const W = frame.width
    const H = frame.height
    const rm = frame.reducedMotion || !!frame.still
    const fov = lay.portrait ? FOV_P : FOV_L
    const f = camIndex(local)
    const fill = lay.portrait ? 0.94 : 0.9
    // the plaque in view; a slow push-in while it holds
    const u = (local - B0) / SPAN
    const p = u - Math.round(clamp(u - 0.5, 0, N - 1))
    const push = local >= B0 && local < B1 ? 0.035 * Math.sin(Math.PI * clamp(p)) : 0
    // a touch of swing while gliding (the camera leans into the move)
    const swing = Math.sin(Math.PI * (f - Math.floor(f))) * 0.06
    rowPos(f, C).y += SUBJ_CY
    frame3(lay.beat, W, H, fov, C, SUBJ_W, SUBJ_H, fill, YAW + swing, PITCH, 1 - push, pB, tB)

    // intro: further back, looking down the row from its first plaque
    // (portrait is narrow: fewer plaques, larger)
    rowPos(lay.portrait ? 0.5 : 1.8, C).y += SUBJ_CY + 0.1
    const drift = easeOut(local / INTRO_GO)
    const introFill = lay.portrait ? 0.98 : 0.94
    frame3(lay.intro, W, H, fov, C, SUBJ_W * (lay.portrait ? 2.5 : 3.4), SUBJ_H * 1.25, introFill, INTRO_YAW, PITCH + 0.07, lerp(1.1, 1, drift), pA, tA)
    const go = easeInOut((local - INTRO_GO) / (B0 + GLIDE_B * SPAN - INTRO_GO))
    pose.pos.lerpVectors(pA, pB, go)
    pose.target.lerpVectors(tA, tB, go)

    // out beat: ease back and up a little for the cut
    const out = easeInOut((local - B1) / (1 - B1))
    if (out > 0) {
      tmp.copy(pose.pos).sub(pose.target).multiplyScalar(0.14 * out)
      pose.pos.add(tmp)
      pose.pos.y += 0.25 * out
    }
    if (!rm) {
      pose.pos.x += Math.sin(frame.time * 0.17) * 0.025
      pose.pos.y += Math.sin(frame.time * 0.23) * 0.018
    }
    pose.fov = fov
    return f
  }

  /* ----------------------------------------------------------- chapter */

  return {
    id: 'voices',
    group,
    // keyboard stops land on each voice once its plaque is lit and the quote is sharp
    anchors: TESTIMONIALS.map((_, i) => B0 + SPAN * (i + 0.55)),

    async init(ctx: ChapterContext) {
      buildDom(ctx.stage)
      const fontsOk = await engraveFontsReady(2500)
      // the quote is body text: enough texels for it to stay crisp on a large plaque
      const cw = ctx.mobile ? 768 : 1024
      const engr = buildEngravings(TESTIMONIALS, { w: cw, h: Math.round((cw * PH) / PW), slotV: SLOT_V })
      for (const it of engr.items) {
        it.redraw()
        await nextFrame()
      }
      row = buildRow(N, engr.items.map(it => it.tex), ctx.world.envMap, ctx.mobile)
      group.add(row.root)
      // the faces arrived late: engrave again with the real type, a plaque a frame
      if (!fontsOk)
        void loadEngraveFonts().then(async ok => {
          if (!ok) return
          engr.remeasure()
          for (const it of engr.items) {
            it.redraw()
            await nextFrame()
          }
        })
    },

    onEnter() {
      sinkAll()
      deferShow = 1
      if (!measured) measure()
    },

    onLeave() {
      sinkAll()
    },

    update(local, frame, ctx) {
      // reduced motion (or Motion off): the etching fades up evenly, no stutter
      const calm = frame.reducedMotion || !!frame.still
      const f = computePose(local, frame)

      /* ---- the row ---- */
      // standby: the base lines come on along the row out of the cut (near to far), and again at the end
      const outK = smoothstep(B1, 0.985, local)
      let peak = 0
      let peakI = 0
      for (const q of row.plaques) {
        const i = q.index
        const d = Math.abs(i - f)
        // far plaques fade into the dark; very far ones aren't drawn
        // the plaques already heard step back into the dark faster than the ones to come
        const vis = (1 - 0.8 * smoothstep(1.2, 4.5, d)) * (1 - 0.85 * smoothstep(0.25, 1.1, f - i))
        q.root.visible = d < 5.5
        const L = lightAt(i, local, calm)
        const wake = smoothstep(0.012 + i * 0.006, 0.032 + i * 0.006, local)
        const standby = (lerp(0.55, 0.3, smoothstep(B0 - 0.01, B0 + 0.02, local)) * wake + 0.4 * outK) * vis
        if (L.on > peak) {
          peak = L.on
          peakI = i
        }
        const eu = q.etch.uniforms
        eu.uLit.value = L.on
        eu.uFront.value = L.front
        eu.uAmb.value = (0.016 + 0.024 * standby) * vis
        const gu = q.edge.uniforms
        gu.uLit.value = L.on
        gu.uFront.value = L.front
        gu.uAmb.value = 0.05 * vis
        q.mEtch.uniforms.uLit.value = L.on
        q.mEtch.uniforms.uFront.value = L.front
        q.mEtch.uniforms.uAmb.value = eu.uAmb.value
        q.mEdge.uniforms.uLit.value = L.on
        q.mEdge.uniforms.uFront.value = L.front
        q.mEdge.uniforms.uAmb.value = gu.uAmb.value
        q.strip.uniforms.uStrip.value = 0.4 * standby + 1.05 * L.strip
        q.caps.envMapIntensity = 0.3 * vis
        q.sides.envMapIntensity = 1.9 * vis
        q.base.envMapIntensity = 1.1 * vis
        // the floor catches a little of each plaque's light
        rowPos(i, tmp)
        row.pools[i].set(tmp.x, tmp.z + BASE_D * 0.2, 0.05 * standby + 0.14 * L.on, 0)
      }

      // the studio's strips slide along the polished edges as the camera glides
      const envTurn = 1.2 + f * 0.32 + (frame.reducedMotion || frame.still ? 0 : Math.sin(frame.time * 0.13) * 0.04)
      for (const q of row.plaques) {
        q.caps.envMapRotation.y = envTurn
        q.sides.envMapRotation.y = envTurn
        q.base.envMapRotation.y = envTurn
      }

      /* ---- world + post ---- */
      const w = ctx.world.params
      w.top = '#020203'
      w.bottom = '#000000'
      // a faint backlight behind the lit plaque, so it stands off the black
      rowPos(peakI, tmp).y += GLASS_Y1 * 0.55
      probe.fov = pose.fov
      probe.aspect = frame.width / Math.max(1, frame.height)
      probe.updateProjectionMatrix()
      probe.position.copy(pose.pos)
      probe.lookAt(pose.target)
      probe.updateMatrixWorld()
      tmp.project(probe)
      if (Number.isFinite(tmp.x + tmp.y)) w.focus.set(tmp.x * probe.aspect, tmp.y)
      w.halo = (lay.portrait ? 0.05 : 0.07) * (0.4 + 0.6 * peak)
      w.haloSize = 1.1
      w.haloColor = '#e6eeff'
      w.slits = 0
      w.env = 1
      w.envTurn = envTurn
      w.key = 0
      w.fill = 0.03
      const post = ctx.post.params
      post.vignette = 0.6
      // no bloom: the slot's glow is drawn in its shader (bloom beads a line this
      // thin and slanted), and the etching's halo comes from its frost (G)
      post.bloomStrength = 0
      post.bloomRadius = 0.3
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

    camera(_local: number, frame: Frame, out: CameraPose) {
      out.position.copy(pose.pos)
      out.target.copy(pose.target)
      out.fov = pose.fov
      out.roll = 0
      out.parallax = frame.reducedMotion || frame.still || frame.mobile ? 0 : 0.14
    },
  }
}
