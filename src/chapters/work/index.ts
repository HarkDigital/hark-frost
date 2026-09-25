import * as THREE from 'three'
import type { CameraPose, Chapter, ChapterContext, Frame } from '../../core/types'
import { el, reveal, rise, setRise } from '../../core/dom'
import { clamp, ease, lerp, smoothstep } from '../../core/math'
import { nextFrame } from '../../core/yield'
import { SECTIONS, WORK, workImage, type WorkItem } from '../../content'
import { G } from '../../kit/glass'
import { loadScreenshot, whenRevealed } from '../../kit/images'
import {
  BAR_W,
  PANEL_Y,
  PH,
  PW,
  SH,
  SHOT_Y,
  STACK_H,
  STACK_THETA,
  STACK_Y,
  arcNormal,
  averageColor,
  buildGallery,
  isPreview,
  onArc,
  studioEnv,
  theta,
  type Gallery,
} from './scene'
import './work.css'

/*
 * COLLECTION (Selected work) — a black gallery of frosted glass.
 *
 * Six tall sandblasted panels stand in a slow arc, each backlit, each with
 * its project's screenshot hung just behind it: through the frost every site
 * is a soft glow of its own colours. As the camera arrives at a panel it
 * THAWS — the faces' roughness runs 0.5 → 0.03 and the site comes sharp
 * through clear glass (a crisp copy fades in over the last of the thaw so it
 * stays legible at any resolution) — and a light sweep glides down its
 * polished edges. As the camera moves on, it frosts over again. A frosted
 * card names the thawed panel. Past the last panel, a directory of nine slim
 * frosted bars with the names etched; the selected (or hovered) row's bar
 * thaws to show its site glowing behind the board.
 *
 *   0.000–0.140  intro: "Built to be heard." — the arc at a 3/4 angle
 *                (headline settled from ~0.05; nav lands at 0.12)
 *   0.140–0.820  six items (~0.113 each): glide 0–30%, thaw 10–42%,
 *                light sweep 30–85%, card 20–99%
 *   0.820–0.850  glide to the directory (a breath of condensation)
 *   0.850–0.955  "Nine more, all live." list; rows thaw in turn
 *   0.955–1.000  out: pull back, everything frosts
 *
 * Everything derives from `local`; frame.time only drives the backlight's
 * slow breathing and the idle sway.
 */

const FEATURED = WORK.filter(w => w.featured)
const REST = WORK.filter(w => !w.featured)
const NF = FEATURED.length
const NR = REST.length

const F0 = 0.14
const F1 = 0.82
const SPAN = (F1 - F0) / NF
const LIST_IN = 0.85
const ROW0 = 0.858
const ROW1 = 0.944
const LIST_OUT = 0.955

/* inside one item (phase p 0..1) */
const TRAVEL = 0.3
const THAW_A = 0.1
const THAW_B = 0.42
const SWEEP_A = 0.3
const SWEEP_B = 0.85

const itemStart = (k: number) => F0 + SPAN * k
/* the glide from the intro to the first panel starts under the fading headline */
const T0A = F0 - 0.012
const T0B = F0 + 0.28 * SPAN
const rowAt = (j: number) => ROW0 + ((j + 0.5) * (ROW1 - ROW0)) / NR

/** intro: how lit each panel is (the far end of the row fades into the dark behind the headline) */
const INTRO_LIT = [1, 1, 0.85, 0.5, 0.28, 0.18]

/** roughness: sandblasted ↔ thawed */
const FROST = 0.42
const CLEAR = 0.025

/* camera */
const CAM_YAW = 0.1
const CAM_PITCH = 0.035
const FOV = 32
const DEG = Math.PI / 180
const UP = new THREE.Vector3(0, 1, 0)

const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve']
const pad = (n: number) => String(n).padStart(2, '0')
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const emLast = (s: string) => {
  const parts = s.split(' ')
  if (parts.length < 2) return `<em>${esc(s)}</em>`
  const last = parts.pop()!
  return `${esc(parts.join(' '))} <em>${esc(last)}</em>`
}
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** 0..1: how thawed featured panel k is at local l */
function thawOf(k: number, l: number) {
  const s = itemStart(k)
  const inn = smoothstep(s + THAW_A * SPAN, s + THAW_B * SPAN, l)
  const next = k < NF - 1 ? itemStart(k + 1) : F1
  const out = smoothstep(next - 0.02 * SPAN, next + 0.22 * SPAN, l)
  return inn * (1 - out)
}

type PhaseKind = 'intro' | 'item' | 'list' | 'out'
interface Phase {
  kind: PhaseKind
  k: number
  p: number
}
function phaseOf(l: number): Phase {
  if (l < F0) return { kind: 'intro', k: -1, p: clamp(l / F0) }
  if (l < F1) {
    const k = Math.min(NF - 1, Math.floor((l - F0) / SPAN))
    return { kind: 'item', k, p: clamp((l - itemStart(k)) / SPAN) }
  }
  if (l < LIST_OUT) return { kind: 'list', k: NF, p: clamp((l - F1) / (LIST_OUT - F1)) }
  return { kind: 'out', k: NF, p: clamp((l - LIST_OUT) / (1 - LIST_OUT)) }
}

interface Region {
  x0: number
  y0: number
  x1: number
  y1: number
}
interface Shot {
  pos: THREE.Vector3
  tgt: THREE.Vector3
  fov: number
  /** subject centre in NDC */
  cx: number
  cy: number
  /** subject half-height in halo units (screen half-height = 1) */
  hh: number
}
const shot = (): Shot => ({ pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: FOV, cx: 0, cy: 0, hh: 0.5 })

interface Layout {
  key: string
  W: number
  H: number
  portrait: boolean
  safe: Region
  dockR: number
  cardTop: number[]
  listR: number
  listTop: number
  introB: number
  introR: number
}

interface CardEl {
  root: HTMLElement
  name: HTMLElement
}

const _d = new THREE.Vector3()
const _r = new THREE.Vector3()
const _u = new THREE.Vector3()
const _c = new THREE.Vector3()
const _n = new THREE.Vector3()

/**
 * Aim a camera (yaw, pitch) so a w×h subject centred at C fills the screen
 * region `reg` (CSS px).
 */
function frameTo(out: Shot, C: THREE.Vector3, w: number, h: number, yaw: number, pitch: number, fov: number, reg: Region, W: number, H: number) {
  _d.set(-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
  const aspect = W / Math.max(1, H)
  const tanH = Math.tan((fov * DEG) / 2)
  const fw = Math.max(0.08, (reg.x1 - reg.x0) / Math.max(1, W))
  const fh = Math.max(0.08, (reg.y1 - reg.y0) / Math.max(1, H))
  const cx = ((reg.x0 + reg.x1) / 2 / Math.max(1, W)) * 2 - 1
  const cy = 1 - ((reg.y0 + reg.y1) / 2 / Math.max(1, H)) * 2
  const dist = Math.max(w / 2 / (fw * tanH * aspect), h / 2 / (fh * tanH))
  const hh = dist * tanH
  const hwid = hh * aspect
  _r.crossVectors(_d, UP).normalize()
  _u.crossVectors(_r, _d).normalize()
  out.pos.copy(C).addScaledVector(_d, -dist).addScaledVector(_r, -cx * hwid).addScaledVector(_u, -cy * hh)
  out.tgt.copy(out.pos).addScaledVector(_d, dist)
  out.fov = fov
  out.cx = cx
  out.cy = cy
  out.hh = h / 2 / hh
  return out
}

class Work implements Chapter {
  id = 'work'
  group = new THREE.Group()
  anchors = [...FEATURED.map((_, k) => itemStart(k) + SPAN * 0.56), ...REST.map((_, j) => rowAt(j))]

  private ctx!: ChapterContext
  private gal!: Gallery
  private mobile = false
  private reduced = false

  // DOM
  private safe!: HTMLElement
  private intro!: HTMLElement
  private introTitle!: HTMLElement
  private dock!: HTMLElement
  private cards: CardEl[] = []
  private listDock!: HTMLElement
  private list!: HTMLElement
  private listTitle!: HTMLElement
  private rows: HTMLAnchorElement[] = []
  private hoverRow = -1
  private curRow = -2

  // layout / camera
  private lay: Layout | null = null
  private layDirty = true
  private cur = shot()
  private sa = shot()
  private sb = shot()
  private tmp = new THREE.Vector3()
  /** per directory bar: 0 = frosted, 1 = thawed (damped) */
  private sel: number[] = REST.map(() => 0)
  private lastT = -1

  async init(ctx: ChapterContext) {
    this.ctx = ctx
    this.mobile = ctx.mobile
    this.reduced = ctx.reducedMotion
    this.buildDom(ctx.stage)
    await nextFrame()
    this.gal = buildGallery(FEATURED, REST, this.mobile, FROST)
    this.group.add(this.gal.root)
    // the chapter's own studio (clean strips; envMapIntensity honoured per
    // material; rotation follows world.params.envTurn each frame)
    let env: THREE.Texture | null = null
    try {
      env = await studioEnv(ctx.renderer, nextFrame)
    } catch (err) {
      console.warn('[work] studio env failed; using the world env', err)
      env = ctx.world.envMap
    }
    if (env) for (const m of this.gal.glass) m.envMap = env
    await nextFrame()
    window.addEventListener('resize', () => (this.layDirty = true))
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => (this.layDirty = true))
      for (const c of this.cards) ro.observe(c.root)
      ro.observe(this.list)
      ro.observe(this.intro)
      ro.observe(this.safe)
    }
    document.fonts?.ready.then(() => (this.layDirty = true))

    // screenshots: the first panel now, the rest once the site is revealed
    const upload = (tex: THREE.Texture) => {
      tex.anisotropy = 8
      try {
        this.ctx.renderer.initTexture(tex)
      } catch {
        /* uploads on first use instead */
      }
    }
    const load = (k: number) =>
      loadScreenshot(workImage(FEATURED[k].id), { width: 960 })
        .then(tex => {
          upload(tex)
          const p = this.gal.panels[k]
          const old = p.shotMat.map
          p.shotMat.map = tex
          p.crispMat.map = tex
          averageColor(tex, p.tint)
          old?.dispose()
        })
        .catch(err => console.warn(`[work] missing screenshot for ${FEATURED[k].id}`, err))
    const loadRest = (j: number) =>
      loadScreenshot(workImage(REST[j].id), { width: 960 })
        .then(tex => {
          upload(tex)
          const b = this.gal.bars[j]
          const old = b.bandMat.map
          b.bandMat.map = tex
          b.crispMat.map = tex
          old?.dispose()
        })
        .catch(err => console.warn(`[work] missing screenshot for ${REST[j].id}`, err))
    load(0)
    whenRevealed().then(async () => {
      for (let k = 1; k < NF; k++) {
        await load(k)
        await nextFrame()
      }
      for (let j = 0; j < NR; j++) {
        await loadRest(j)
        await nextFrame()
      }
    })
  }

  // ------------------------------------------------------------------ DOM

  private buildDom(stage: HTMLElement) {
    this.safe = el('div', 'wk-safe', undefined, stage)

    // intro
    this.intro = el('div', 'wk-intro', undefined, stage)
    el('p', 'hud-eyebrow', SECTIONS.work.eyebrow, this.intro)
    const title = SECTIONS.work.title
    const cut = title.lastIndexOf(' ')
    this.introTitle = rise(
      el('h2', 'hud-h2 wk-title', undefined, this.intro),
      cut > 0 ? `${esc(title.slice(0, cut))} <em>${esc(title.slice(cut + 1))}</em>` : `<em>${esc(title)}</em>`,
    )
    const count = el('p', 'wk-count', undefined, this.intro)
    count.innerHTML = [`${WORK.length} sites`, `${NF} featured`, `${NR} more`].map(s => `<span>${esc(s)}</span>`).join('<i aria-hidden="true"></i>')

    // one frosted card per panel, docked left (bottom on portrait)
    this.dock = el('div', 'wk-dock', undefined, stage)
    FEATURED.forEach((w, k) => this.cards.push(this.buildCard(this.dock, w, k)))

    // the other nine
    this.listDock = el('div', 'wk-dock wk-dock--list', undefined, stage)
    this.list = el('section', 'wk-list hud-panel hud-panel--strong', undefined, this.listDock)
    const meta = el('div', 'wk-meta', undefined, this.list)
    el('span', 'wk-num', `${pad(NF + 1)}–${pad(NF + NR)} / ${pad(WORK.length)}`, meta)
    el('span', 'hud-label wk-ind', 'More work', meta)
    const allLive = REST.every(w => !isPreview(w.url))
    const count9 = WORDS[NR] ?? String(NR)
    this.listTitle = rise(
      el('h3', 'hud-h2 wk-list-title', undefined, this.list),
      allLive ? `${esc(count9)} more, <em>all live.</em>` : `${esc(count9)} <em>more.</em>`,
    )
    const ol = el('ol', 'wk-rows', undefined, this.list)
    REST.forEach((w, j) => {
      const li = el('li', '', undefined, ol)
      const a = el('a', 'wk-row', undefined, li)
      a.href = w.url
      a.target = '_blank'
      a.rel = 'noopener'
      const pre = isPreview(w.url)
      a.innerHTML = `<span class="wk-no">${pad(NF + j + 1)}</span><span class="wk-rname">${esc(w.name)}${
        pre ? ' <small class="wk-pre">Preview</small>' : ''
      }</span><span class="wk-rind">${esc(w.industry)}</span><span class="wk-arrow" aria-hidden="true">↗</span>`
      const on = () => (this.hoverRow = j)
      const off = () => {
        if (this.hoverRow === j) this.hoverRow = -1
      }
      a.addEventListener('pointerenter', on)
      a.addEventListener('pointerleave', off)
      a.addEventListener('focus', on)
      a.addEventListener('blur', off)
      this.rows.push(a)
    })
    const cta = el('div', 'wk-cta', undefined, this.list)
    const hello = el('button', 'hud-btn', 'Say hello', cta)
    hello.type = 'button'
    hello.addEventListener('click', () => window.__hark?.land('contact'))
  }

  private buildCard(parent: HTMLElement, w: WorkItem, k: number): CardEl {
    const root = el('article', 'wk-card hud-panel hud-panel--strong', undefined, parent)
    const pre = isPreview(w.url)
    const meta = el('div', 'wk-meta', undefined, root)
    el('span', 'wk-num', `${pad(k + 1)} / ${pad(NF)}`, meta)
    el('span', 'hud-label wk-ind', w.industry, meta)
    if (pre) el('span', 'wk-badge', 'Preview', meta)
    const name = rise(el('h3', 'hud-h2 wk-name', undefined, root), emLast(w.name))
    el('p', 'hud-body wk-blurb', w.blurb, root)
    const tags = el('ul', 'hud-tags wk-tags', undefined, root)
    for (const t of w.tags) el('li', 'hud-tag', t, tags)
    const cta = el('div', 'wk-cta', undefined, root)
    const a = el('a', 'hud-btn wk-visit', pre ? 'Preview site ↗' : 'Visit site ↗', cta)
    a.href = w.url
    a.target = '_blank'
    a.rel = 'noopener'
    el('span', 'hud-label wk-host', pre ? 'Pre-launch build' : hostOf(w.url), cta)
    return { root, name }
  }

  // ------------------------------------------------------------------ layout

  private ensureLayout(f: Frame): Layout {
    const key = `${f.width}x${f.height}`
    if (this.lay && this.lay.key === key && !this.layDirty) return this.lay
    this.layDirty = false
    const W = f.width
    const H = f.height
    const portrait = typeof matchMedia === 'function' ? matchMedia('(max-aspect-ratio: 10/9)').matches : W / H < 1.1
    const s = this.safe.getBoundingClientRect()
    const safe = s.width > 0 ? { x0: s.left, y0: s.top, x1: s.right, y1: s.bottom } : { x0: 24, y0: 90, x1: W - 24, y1: H - 90 }
    // offset* metrics ignore the reveal() translate on hidden cards / the list
    const dock = this.dock
    const ld = this.listDock
    const list = this.list
    const measured = dock.offsetWidth > 0
    this.lay = {
      key,
      W,
      H,
      portrait,
      safe,
      dockR: measured ? dock.offsetLeft + dock.offsetWidth : W * 0.38,
      cardTop: this.cards.map(c => (measured && c.root.offsetHeight > 0 ? dock.offsetTop + c.root.offsetTop : H * 0.55)),
      listR: list.offsetWidth > 0 ? ld.offsetLeft + list.offsetLeft + list.offsetWidth : W * 0.4,
      listTop: list.offsetHeight > 0 ? ld.offsetTop + list.offsetTop : H * 0.45,
      introB: this.intro.offsetHeight > 0 ? this.intro.offsetTop + this.intro.offsetHeight : H * 0.35,
      introR: this.intro.offsetWidth > 0 ? this.intro.offsetLeft + this.intro.offsetWidth : W * 0.45,
    }
    return this.lay
  }

  private region(kind: 'item' | 'list' | 'intro', k: number): Region {
    const L = this.lay!
    const s = L.safe
    if (kind === 'intro') {
      if (L.portrait) return { x0: 0, x1: L.W, y0: Math.min(L.introB + 12, L.H * 0.6), y1: s.y1 + L.H * 0.03 }
      return { x0: L.W * 0.16, x1: L.W, y0: s.y0 + L.H * 0.02, y1: s.y1 + L.H * 0.06 }
    }
    if (L.portrait) {
      const top = kind === 'item' ? L.cardTop[k] : L.listTop
      return { x0: 6, x1: L.W - 6, y0: s.y0 - 6, y1: Math.max(s.y0 + 90, top - 12) }
    }
    const right = kind === 'item' ? L.dockR : L.listR
    return { x0: right + L.W * 0.03, x1: s.x1 + L.W * 0.01, y0: s.y0 - L.H * 0.03, y1: s.y1 + L.H * 0.03 }
  }

  // ------------------------------------------------------------------ shots

  /** the screenshot centre of panel k, a touch toward the viewer */
  private itemShot(k: number, drift: number, out: Shot) {
    const L = this.lay!
    const th = theta(k)
    arcNormal(th, _n)
    onArc(th, undefined, _c).addScaledVector(_n, 0.1)
    _c.y = PANEL_Y + SHOT_Y - 0.06
    const yaw = -th + CAM_YAW - drift * 0.05
    const port = L.portrait
    frameTo(out, _c, PW + (port ? 0.1 : 0.34), SH + (port ? 0.46 : 0.66), yaw, CAM_PITCH, FOV, this.region('item', k), L.W, L.H)
    out.pos.lerp(out.tgt, drift * 0.04)
    return out
  }

  private introShot(u: number, out: Shot) {
    const L = this.lay!
    const port = L.portrait
    const at = port ? 1.0 : 1.1
    onArc(theta(at), undefined, _c)
    _c.y = PANEL_Y - 0.1
    const yaw = -theta(at) + (port ? lerp(0.6, 0.56, u) : lerp(0.78, 0.72, u))
    frameTo(out, _c, port ? 3.3 : 6.2, PH + (port ? 0.5 : 1.0), yaw, lerp(0.07, 0.06, u), FOV, this.region('intro', 0), L.W, L.H)
    return out
  }

  /** the directory board; `row` (0..1) eases the aim down the board as the rows advance */
  private stackShot(drift: number, row: number, out: Shot) {
    const L = this.lay!
    const port = L.portrait
    arcNormal(STACK_THETA, _n)
    onArc(STACK_THETA, undefined, _c).addScaledVector(_n, 0.06)
    _c.y = STACK_Y + (port ? 0.1 - 0.2 * row : 0.04 - 0.08 * row)
    const yaw = -STACK_THETA + 0.12 - drift * 0.05
    frameTo(out, _c, BAR_W + (port ? 0.16 : 0.5), STACK_H + (port ? 0.28 : 0.5), yaw, 0.06, FOV, this.region('list', 0), L.W, L.H)
    out.pos.lerp(out.tgt, drift * 0.035)
    return out
  }

  private outShot(out: Shot) {
    this.stackShot(1, 1, out)
    this.tmp.subVectors(out.pos, out.tgt)
    out.pos.copy(out.tgt).addScaledVector(this.tmp, 1.35)
    out.pos.y += 0.3
    out.hh *= 0.75
    return out
  }

  private travel(a: Shot, b: Shot, t: number, pull: number, out: Shot) {
    const e = ease.inOutCubic(clamp(t))
    out.pos.lerpVectors(a.pos, b.pos, e)
    out.tgt.lerpVectors(a.tgt, b.tgt, e)
    out.fov = lerp(a.fov, b.fov, e)
    out.cx = lerp(a.cx, b.cx, e)
    out.cy = lerp(a.cy, b.cy, e)
    out.hh = lerp(a.hh, b.hh, e)
    const bump = Math.sin(Math.PI * clamp(t)) * pull
    this.tmp.subVectors(out.pos, out.tgt).normalize()
    out.pos.addScaledVector(this.tmp, bump)
    out.pos.y += bump * 0.12
    return out
  }

  private shotAt(l: number, out: Shot) {
    if (l < T0A) return this.introShot(l / T0A, out)
    if (l < T0B) return this.travel(this.introShot(1, this.sa), this.itemShot(0, 0, this.sb), (l - T0A) / (T0B - T0A), 0.2, out)
    const ph = phaseOf(l)
    if (ph.kind === 'item') {
      const k = ph.k
      if (k > 0 && ph.p < TRAVEL) return this.travel(this.itemShot(k - 1, 1, this.sa), this.itemShot(k, 0, this.sb), ph.p / TRAVEL, 0.6, out)
      const tr = k === 0 ? (T0B - F0) / SPAN : TRAVEL
      return this.itemShot(k, clamp((ph.p - tr) / (1 - tr)), out)
    }
    const row = smoothstep(ROW0, ROW1, l)
    if (l < LIST_IN) return this.travel(this.itemShot(NF - 1, 1, this.sa), this.stackShot(0, 0, this.sb), (l - F1) / (LIST_IN - F1), 0.8, out)
    if (l < LIST_OUT) return this.stackShot((l - LIST_IN) / (LIST_OUT - LIST_IN), row, out)
    return this.travel(this.stackShot(1, 1, this.sa), this.outShot(this.sb), (l - LIST_OUT) / (1 - LIST_OUT), 0, out)
  }

  // ------------------------------------------------------------------ light

  /**
   * The studio's rotation (world.params.envTurn): a slow pass in the intro,
   * then one sweep down each panel's polished edges as it thaws (alternating
   * direction so the value stays continuous), then a drift for the list.
   */
  private turnAt(l: number) {
    const amp = this.reduced ? 0.16 : 0.36
    const center = (k: number) => TURN_C + theta(k)
    const startOf = (k: number) => center(k) - (k % 2 === 0 ? amp : -amp)
    const endOf = (k: number) => center(k) + (k % 2 === 0 ? amp : -amp)
    const I0 = startOf(0) - 0.9
    const I1 = startOf(0)
    if (l < F0) return lerp(I0, I1, smoothstep(0, F0, l))
    if (l < F1) {
      const k = Math.min(NF - 1, Math.floor((l - F0) / SPAN))
      const p = clamp((l - itemStart(k)) / SPAN)
      const prev = k === 0 ? I1 : endOf(k - 1)
      if (p < SWEEP_A) return lerp(prev, startOf(k), smoothstep(0, SWEEP_A, p))
      return lerp(startOf(k), endOf(k), ease.inOutCubic(clamp((p - SWEEP_A) / (SWEEP_B - SWEEP_A))))
    }
    const e5 = endOf(NF - 1)
    return lerp(e5, e5 - 0.6, smoothstep(F1, 1, l))
  }

  // ------------------------------------------------------------------ frame

  update(local: number, frame: Frame, ctx: ChapterContext) {
    const l = clamp(local)
    const time = frame.time
    const dt = this.lastT < 0 ? 1 : Math.min(0.1, Math.max(0, time - this.lastT))
    this.lastT = time
    const reduced = this.reduced || frame.reducedMotion
    const still = reduced || !!frame.still
    this.ensureLayout(frame)
    const ph = phaseOf(l)
    const gal = this.gal
    if (!gal) return

    // ---- camera shot (camera() copies it)
    this.shotAt(l, this.cur)
    const s = this.cur

    // ---- thaw state
    let thawMax = 0
    const thaw: number[] = []
    for (let k = 0; k < NF; k++) {
      const t = thawOf(k, l)
      thaw.push(t)
      thawMax = Math.max(thawMax, t)
    }
    const inList = l > F1 + 0.35 * SPAN

    // ---- world: black studio, the backlight halo right behind the subject
    const wp = ctx.world.params
    _d.subVectors(s.tgt, s.pos).normalize()
    const yawW = Math.atan2(_d.x, -_d.z)
    const pitchW = Math.asin(clamp(_d.y, -1, 1))
    const aspect = frame.width / Math.max(1, frame.height)
    wp.focus.set(s.cx * aspect + Math.sin(yawW) * 0.25, s.cy + pitchW * 0.2)
    const breath = still ? 0 : Math.sin(time * 0.5) * 0.04
    const introK = 1 - smoothstep(T0A, T0B, l)
    const listK = smoothstep(F1, LIST_IN, l)
    // the halo lights the frost from behind; once a pane is clear it drops
    // back so the site floats on black
    wp.halo = lerp(lerp(0.5, 0.55 - 0.25 * thawMax, 1 - introK), 0.5, listK) + breath
    wp.haloSize = clamp(s.hh * lerp(1.3, 1.1, 1 - introK), 0.45, 1.6)
    wp.slits = 0.3 * introK
    wp.slitAngle = 0
    wp.top = '#020203'
    wp.bottom = '#000000'
    wp.env = 1
    wp.envTurn = this.turnAt(l)
    wp.key = 0.7
    wp.keyDir.set(-0.45, 0.8, 0.4)
    wp.fill = 0.06

    const scene = this.group.parent as THREE.Scene | null
    if (scene && (scene as THREE.Scene).isScene) for (const m of gal.glass) m.envMapRotation.copy(scene.environmentRotation)

    // ---- post: deep vignette, bloom only on hard glints; a breath of
    // condensation on the glide to the directory
    const pp = ctx.post.params
    const fp = clamp((l - F1) / (LIST_IN - F1 + 0.01))
    pp.frost = Math.sin(Math.PI * fp) * (reduced ? 0.08 : 0.2)
    pp.vignette = 0.7
    pp.bloomStrength = 0.32
    pp.bloomThreshold = 1.05

    // ---- panels
    for (let k = 0; k < NF; k++) {
      const p = gal.panels[k]
      const t = thaw[k]
      const e = t * t * (3 - 2 * t)
      // only the panels near the story's position (the rest are off frame anyway):
      // keeps the transmissive count low, especially once the directory is up
      p.station.visible = ph.kind === 'intro' ? true : inList ? k === NF - 1 && l < LIST_IN + 0.01 : Math.abs(k - Math.min(ph.k, NF - 1)) <= 2
      p.thaw.uThaw.value = t
      p.thaw.uEdge.value = 0.12 + 0.88 * Math.sin(Math.PI * t)
      p.caps.envMapIntensity = lerp(0.4, 0.3, e)
      p.sides.envMapIntensity = lerp(1.4, 2.4, e)
      // frosted: the site is a soft glow of its colours; thawed: sharp and bright
      // in the intro the far end of the row recedes into the dark (behind the headline)
      const lit = lerp(1, INTRO_LIT[k], introK)
      p.shotMat.color.setScalar(lerp(0.84, 0.86, e) * lit)
      p.crispMat.opacity = smoothstep(0.7, 0.97, t)
      p.backMat.uniforms.uStrength.value = lerp(0.4, 0.3, e) * (1 + breath) * lit
      p.backMat.uniforms.uHole.value = 0.9 * e
      p.poolMat.uniforms.uColor.value.copy(p.tint).lerp(_white, 0.35)
      p.poolMat.uniforms.uStrength.value = lerp(0.07, 0.12, e)
      p.label.material.opacity = lerp(0.62, 0.9, e)
      const sway = still ? 0 : Math.sin(time * 0.3 + k * 1.7) * 0.012 * (1 - e)
      p.pivot.rotation.y = lerp(-0.06, 0, e) + sway
      p.pivot.position.z = 0.08 * e
    }

    // ---- the directory: the selected row's bar thaws
    const stackOn = l > F1 - 0.12 * SPAN
    gal.stack.visible = stackOn
    if (stackOn) {
      const inRows = l >= ROW0 - 0.004
      const scrollRow = clamp(Math.floor(((l - ROW0) / (ROW1 - ROW0)) * NR), 0, NR - 1)
      // the out beat: every bar frosts over again
      const selIdx = l > LIST_OUT ? -1 : this.hoverRow >= 0 ? this.hoverRow : inRows ? scrollRow : -1
      const kS = 1 - Math.exp(-7 * dt)
      for (let j = 0; j < NR; j++) {
        const b = gal.bars[j]
        const target = j === selIdx ? 1 : 0
        this.sel[j] += (target - this.sel[j]) * kS
        if (Math.abs(target - this.sel[j]) < 1e-3) this.sel[j] = target
        const sv = this.sel[j]
        const e = sv * sv * (3 - 2 * sv)
        b.thaw.uThaw.value = sv
        b.thaw.uEdge.value = 0.12 + 0.88 * Math.sin(Math.PI * sv)
        b.caps.envMapIntensity = lerp(0.4, 0.3, e)
        b.root.position.z = 0.05 * e
        b.label.material.opacity = lerp(0.62, 1, e)
        b.bandMat.color.setScalar(lerp(0.55, 0.86, e))
        b.crispMat.opacity = smoothstep(0.7, 0.97, sv)
      }
      gal.sides.envMapIntensity = 1.3
      gal.stackBackMat.uniforms.uStrength.value = 0.17 * (1 + breath)
      gal.stackPoolMat.uniforms.uStrength.value = 0.08
      if (selIdx !== this.curRow) {
        this.rows.forEach((r, j) => r.classList.toggle('is-cur', j === selIdx))
        this.curRow = selIdx
      }
    }

    // ---- DOM
    const introV = 1 - smoothstep(F0 - 0.008, F0 + 0.008, l)
    reveal(this.intro, introV, 0)
    setRise(this.introTitle, l > 0.012 && l < F0 + 0.004)
    for (let k = 0; k < NF; k++) {
      let v = 0
      if (ph.kind === 'item' && ph.k === k) v = smoothstep(0.2, 0.3, ph.p) * (1 - smoothstep(0.94, 0.995, ph.p))
      reveal(this.cards[k].root, v, 10)
      setRise(this.cards[k].name, v > 0.3)
    }
    const listV = smoothstep(F1 + 0.022, LIST_IN + 0.002, l) * (1 - smoothstep(LIST_OUT - 0.002, LIST_OUT + 0.008, l))
    reveal(this.listDock, listV, 10)
    // a list that hides under a still cursor never gets its pointerleave
    if (listV <= 0.01) this.hoverRow = -1
    setRise(this.listTitle, listV > 0.35)
  }

  camera(_local: number, _frame: Frame, out: CameraPose) {
    out.position.copy(this.cur.pos)
    out.target.copy(this.cur.tgt)
    out.fov = this.cur.fov
    out.parallax = this.reduced ? 0 : 0.1
  }

  onLeave() {
    this.hoverRow = -1
  }
}

const _white = new THREE.Color(G.white)

/* studio turn: the value that lays the tall key strip along panel 0's right edge */
const TURN_C = 0.35

export default function create(): Chapter {
  return new Work()
}
