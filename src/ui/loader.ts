import { BRAND } from '../content'
import { holdInert, releaseInert } from './inert'
import { MARK_ALL, MARK_VIEWBOX, MARK_W } from './mark'

/*
 * Boot screen: "the mark is cut from frosted glass".
 *
 * Black. The Hark mark's outline is drawn as a razor-thin white line (every
 * contour at once, stroke-dashoffset) as progress() rises; behind it the
 * sandblasted faces fill in with a soft frosted glow (a grained translucent
 * white) and a backlight halo swells, the way the 3D mark glows from behind.
 * A tiny mono percentage counts underneath.
 *
 * finish(): the line closes, the halo breathes once, then CONDENSATION forms
 * over the screen from the edges in (a haze that blurs the scene behind it),
 * the black drops away underneath, and the fog clears from the centre out
 * onto the live scene (~0.95 s, the same breath the chapter cuts use).
 * finish() resolves as the fog starts to clear (main.ts fires 'hark:reveal',
 * so the hero comes into focus with it); the node removes itself after.
 *
 * Rules: shows at least ~1.2 s, never hangs (every wait is a timer, never an
 * animation frame, so a background tab still finishes; frames only paint the
 * in-betweens), the page behind is inert while it's up, skip (?nointro)
 * removes it at once. Reduced motion (or Motion switched off earlier this
 * session): no fog, the line simply completes and the black fades.
 *
 * API used by main.ts: createLoader(root, { skip }) → { progress(0..1), finish() }.
 */

const MIN_MS = 1200
/** once finish() is called: the line closes */
const CLOSE_MS = 320
/** the halo's one breath */
const LIT_MS = 200
/** condensation forms from the edges in */
const FORM_MS = 280
/** and clears from the centre out */
const CLEAR_MS = 540
/** the black drops away under full fog */
const HOLD_MS = 120

const wait = (ms: number) => new Promise<void>(r => window.setTimeout(r, ms))
const clamp01 = (v: number) => (v > 0 ? (v < 1 ? v : 1) : 0)
const ease = (t: number) => 1 - Math.pow(1 - clamp01(t), 3)

/**
 * A tween painted on animation frames but finished by a timer: in a hidden
 * tab (no rAF) it still lands on its last value on time.
 */
function tween(ms: number, fn: (t: number) => void) {
  return new Promise<void>(resolve => {
    const t0 = performance.now()
    let done = false
    let raf = 0
    const end = () => {
      if (done) return
      done = true
      cancelAnimationFrame(raf)
      fn(1)
      resolve()
    }
    const step = (now: number) => {
      if (done) return
      const t = (now - t0) / ms
      if (t >= 1) return end()
      fn(t)
      raf = requestAnimationFrame(step)
    }
    fn(0)
    raf = requestAnimationFrame(step)
    window.setTimeout(end, ms + 20)
  })
}

export function createLoader(root: HTMLElement, { skip = false } = {}) {
  if (skip) {
    root.remove()
    return { progress() {}, finish: () => Promise.resolve() }
  }

  let motionOff = false
  try {
    motionOff = sessionStorage.getItem('hark-frost:motion') === '0'
  } catch {
    /* blocked storage */
  }
  const calm = motionOff || matchMedia('(prefers-reduced-motion: reduce)').matches
  const lowfx = matchMedia('(pointer: coarse)').matches || window.innerWidth < 768

  const paths = (attrs: string) => MARK_ALL.map(d => `<path d="${d}" ${attrs}/>`).join('')
  root.innerHTML = `
  <div class="ld${calm ? ' is-calm' : ''}${lowfx ? ' is-lowfx' : ''}">
    <div class="ld-bg"></div>
    <p class="sr-only" role="status">Loading ${BRAND.name}</p>
    <div class="ld-stage" aria-hidden="true">
    <div class="ld-halo"><i></i></div>
    <div class="ld-core">
      <div class="ld-mark">
        <svg class="ld-glow" viewBox="${MARK_VIEWBOX}" focusable="false">${paths('')}</svg>
        <svg class="ld-face" viewBox="${MARK_VIEWBOX}" focusable="false">
          <defs>
            <linearGradient id="ld-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#ffffff" stop-opacity="0.78"/>
              <stop offset="0.5" stop-color="#e4e8ee" stop-opacity="0.5"/>
              <stop offset="1" stop-color="#9aa1ab" stop-opacity="0.42"/>
            </linearGradient>
            <filter id="ld-frost" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
              <feTurbulence class="ld-turb" type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="7" result="n"/>
              <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -1.1 1.4" result="a"/>
              <feComposite in="SourceGraphic" in2="a" operator="in"/>
            </filter>
          </defs>
          <g fill="url(#ld-grad)" filter="url(#ld-frost)">${paths('')}</g>
        </svg>
        <svg class="ld-line" viewBox="${MARK_VIEWBOX}" focusable="false">
          <g fill="none" stroke="#ffffff" stroke-linejoin="round" stroke-linecap="round">${paths('pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"')}</g>
        </svg>
      </div>
      <p class="ld-pct"><span class="ld-num">000</span><span class="ld-unit">%</span></p>
    </div>
    </div>
    <div class="ld-fog" aria-hidden="true"></div>
  </div>`
  holdInert('loader', [
    document.getElementById('track'),
    document.getElementById('stages'),
    document.getElementById('chrome'),
    document.querySelector<HTMLElement>('.skip-link'),
  ])

  const wrap = root.querySelector<HTMLElement>('.ld')!
  const markBox = root.querySelector<HTMLElement>('.ld-mark')!
  const lineSvg = root.querySelector<SVGSVGElement>('.ld-line')!
  const lines = [...root.querySelectorAll<SVGPathElement>('.ld-line path')]
  const face = root.querySelector<SVGSVGElement>('.ld-face')!
  const glow = root.querySelector<SVGSVGElement>('.ld-glow')!
  const halo = root.querySelector<HTMLElement>('.ld-halo')!
  const turb = root.querySelector<SVGElement>('.ld-turb')
  const num = root.querySelector<HTMLElement>('.ld-num')!
  const fog = root.querySelector<HTMLElement>('.ld-fog')!

  // a razor line is 1 CSS px at whatever size the mark is drawn; the frost
  // grain is ~2 px, whatever the size
  const size = () => {
    const w = markBox.getBoundingClientRect().width || 96
    const unitsPerPx = MARK_W / w
    lineSvg.querySelector('g')?.setAttribute('stroke-width', (unitsPerPx * 1.05).toFixed(2))
    turb?.setAttribute('baseFrequency', (0.55 / unitsPerPx).toFixed(4))
  }
  size()
  window.addEventListener('resize', size)

  const start = performance.now()
  let target = 0
  let shown = 0
  let finishing = false
  let lastPct = -1
  let lastT = start
  let raf = 0
  let alive = true

  const apply = () => {
    // the loops draw together, the diamond a beat behind
    lines.forEach((p, i) => {
      const lag = i === lines.length - 1 ? 0.12 : 0
      const v = clamp01((shown - lag) / (1 - lag))
      p.setAttribute('stroke-dashoffset', (1 - v).toFixed(4))
    })
    // the frosted faces fill in behind the line, lit from behind
    const fill = clamp01((shown - 0.25) / 0.75)
    face.style.opacity = (fill * fill).toFixed(3)
    glow.style.opacity = (fill * 0.55).toFixed(3)
    halo.style.opacity = (0.25 + shown * 0.75).toFixed(3)
    halo.style.transform = `translate(-50%, -50%) scale(${(0.72 + shown * 0.28).toFixed(3)})`
    const pct = Math.round(shown * 100)
    if (pct !== lastPct) {
      lastPct = pct
      num.textContent = String(pct).padStart(3, '0')
    }
  }

  const frame = (ms: number) => {
    raf = 0
    if (!alive) return
    const dt = Math.min(0.05, Math.max(0, (ms - lastT) / 1000))
    lastT = ms
    // cosmetic easing toward the real progress; before finish() it may only
    // creep toward ~92% at the pace of the minimum time, so the line always
    // has time to draw and 100 always means "done"
    const cap = finishing ? 1 : Math.min(0.92, ((ms - start) / MIN_MS) * 0.92)
    const goal = Math.min(finishing ? 1 : target, cap)
    shown += (goal - shown) * (1 - Math.exp(-dt * (finishing ? 9 : 3.4)))
    if (Math.abs(goal - shown) < 0.002) shown = goal
    apply()
    raf = requestAnimationFrame(frame)
  }
  apply()
  raf = requestAnimationFrame(frame)

  const setFog = (hole: number) => {
    // a clear hole in the condensation, `hole` % of the way to the corners
    const r = hole.toFixed(1)
    const m = `radial-gradient(circle at 50% 50%, transparent ${r}%, #000 ${(hole + 30).toFixed(1)}%)`
    fog.style.setProperty('-webkit-mask-image', m)
    fog.style.setProperty('mask-image', m)
  }

  const teardown = () => {
    alive = false
    if (raf) cancelAnimationFrame(raf)
    window.removeEventListener('resize', size)
    releaseInert('loader')
    root.remove()
  }

  return {
    progress(p: number) {
      const v = clamp01(Number.isFinite(p) ? p : 0)
      target = Math.max(target, v)
    },
    async finish(): Promise<void> {
      if (!alive) return
      const left = MIN_MS - (performance.now() - start)
      if (left > 0) await wait(left)
      // the line closes and the faces fill
      finishing = true
      target = 1
      await wait(CLOSE_MS)
      shown = 1
      apply()
      if (calm) {
        // no fog: the black simply fades onto the scene
        wrap.classList.add('is-out')
        releaseInert('loader')
        window.setTimeout(teardown, 460)
        await wait(80)
        return
      }
      // the halo breathes once behind the glass
      wrap.classList.add('is-lit')
      await wait(LIT_MS)
      // condensation forms from the edges in…
      wrap.classList.add('is-fog')
      await tween(FORM_MS, t => setFog(130 * (1 - ease(t))))
      // …the black drops away beneath it…
      wrap.classList.add('is-out')
      releaseInert('loader')
      await wait(HOLD_MS)
      // …and it clears from the centre out onto the live scene
      void tween(CLEAR_MS, t => setFog(-30 + 160 * ease(t)))
      window.setTimeout(teardown, CLEAR_MS + 90)
      // hand over as the clearing begins, so the scene's own reveal rides it
      await wait(60)
    },
  }
}
