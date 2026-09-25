import type { Engine, EngineState } from '../core/Engine'
import type { Frame } from '../core/types'
import type { Sound } from './sound'
import { BRAND, MICROCOPY } from '../content'
import { CONCEPT_TAG, WORDMARK, markOutlineSvg, markSvg } from './mark'
import { holdInert, releaseInert } from './inert'
import { mountRotateGate } from './rotate'
import { bindScene, holdScene, releaseScene } from './scene'
import { noteChapter } from './fallback'

/*
 * Persistent chrome: black, and frosted glass. Minimal, cold, precise — the
 * placards in a black gallery.
 *
 *   top-left      the Hark mark, razor sharp and white, set in a small
 *                 frosted glass tile lit from behind; the real
 *                 "Hark.Digital" wordmark (its dot a polished glass bead)
 *                 and a small "Concept · Frost" tag (→ the start)
 *   top-right     a frosted capsule: Work · Services · Contact (a hairline
 *                 comes into focus under the chapter you are in) and the
 *                 white "Start a project" pill. ≤ 720px: a "Menu" pill opens
 *                 a full-screen black frosted sheet (a real modal dialog:
 *                 focus trap, Escape, inert background with a fallback,
 *                 focus returns to Menu) with a big nav, 'Start a project',
 *                 'Read as a page', the Sound / Motion switches, and the
 *                 mark drawn as a hairline behind it. While it is up the
 *                 chapter layer underneath is hidden and the scene holds
 *                 still behind the frost.
 *   bottom-left   "Preferences" (a named region, so the pause control is
 *                 reachable by landmark): Sound — three hairline bars that
 *                 ride the actual audio (aria-pressed); Motion — a hairline
 *                 turntable whose bead turns slowly while motion is on
 *                 (aria-pressed). Motion off sets html.motion-off and
 *                 engine.motion = false, is remembered for the session and
 *                 starts off under prefers-reduced-motion. ≤ 440px both
 *                 become round glyph pills.
 *   bottom-right  the readout "03 / 07 · Etched · Services" over seven
 *                 hairline pips (each a ≥ 24px button; the current one a
 *                 white bar; hovering one cues "Go to …" in the readout).
 *   Read as a page  the static page (?read), opened at the chapter you are
 *                 on (?read#<id>, kept in step by update()). The last chrome
 *                 Tab stop, hidden until focused like a skip link; the Menu
 *                 sheet carries it too.
 *
 * Contrast: every text sits on a frosted fill dense enough (or a black scrim
 * band) for ≥ 4.5:1 over the brightest glass the scene can put behind it.
 * The always-visible chrome has no backdrop-filter (it would make the
 * compositor wait on every WebGL frame); only the menu sheet frosts for
 * real, and not under html.lowfx.
 *
 * API used by main.ts: createChrome(root, engine, sound) → { update(frame, state) }.
 * Navigation always uses engine.land(id) (lands on settled copy; long jumps cut).
 */

/** Plain business names beside each chapter's poetic label. */
const BUSINESS: Record<string, string> = {
  hero: 'Home',
  work: 'Work',
  services: 'Services',
  voices: 'Clients',
  shield: 'Security',
  process: 'Process',
  contact: 'Contact',
}
const NAV = ['work', 'services', 'contact']
const MENU_QUERY = '(max-width: 720px)'
const MOTION_KEY = 'hark-frost:motion'
const READ_LABEL = 'Read as a page'
/** the static page (main.ts renders the fallback for ?read; it scrolls to the #chapter) */
const readHref = (id: string) => `?read#${id}`

const readMotion = (fallback: boolean) => {
  try {
    const v = sessionStorage.getItem(MOTION_KEY)
    if (v === '1') return true
    if (v === '0') return false
  } catch {
    /* blocked storage: the default for this visit */
  }
  return fallback
}
const rememberMotion = (on: boolean) => {
  try {
    sessionStorage.setItem(MOTION_KEY, on ? '1' : '0')
  } catch {
    /* blocked storage: the choice lasts until reload */
  }
}
const pad = (n: number) => String(n).padStart(2, '0')
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

const MENU_IC = `<svg class="ch-ic" viewBox="0 0 18 12" aria-hidden="true" focusable="false"><path d="M2 3.5h14M5 8.5h11"/></svg>`
const CLOSE_IC = `<svg class="ch-ic" viewBox="0 0 18 12" aria-hidden="true" focusable="false"><path d="M4.5 1.5l9 9M13.5 1.5l-9 9"/></svg>`
const EQ = `<span class="ch-eq" aria-hidden="true"><i></i><i></i><i></i><b></b></span>`
const ORBIT = `<svg class="ch-orbit" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle class="ch-orbit-r" cx="8" cy="8" r="5.6"/><g class="ch-orbit-g"><circle class="ch-orbit-b" cx="8" cy="2.4" r="1.7"/></g></svg>`

export function createChrome(root: HTMLElement, engine: Engine, sound: Sound) {
  const slots = engine.slots
  const total = slots.length
  const indexOf = (id: string) => slots.findIndex(s => s.def.id === id)
  const biz = (id: string, fallback = '') => BUSINESS[id] ?? fallback
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

  // the rotate card and the menu sheet both hold the scene still behind their
  // frost (ref-counted, so engine.paused = shown for either, and only wakes
  // once both have let go)
  bindScene(engine)
  mountRotateGate(shown => (shown ? holdScene('rotate') : releaseScene('rotate')))

  // ---------------------------------------------------------------- markup

  const brandInner = `<span class="ch-tile" aria-hidden="true">${markSvg('ch-mark-svg')}</span>
      <span class="ch-brand-text" aria-hidden="true">${WORDMARK}${CONCEPT_TAG}</span>`

  const links = NAV.filter(id => indexOf(id) >= 0)
    .map(id => `<li><a class="ch-link" href="#${id}" data-go="${id}">${biz(id)}</a></li>`)
    .join('')

  const pips = slots
    .map(
      (s, i) =>
        `<li><button class="ch-pip" type="button" data-go="${s.def.id}" aria-label="${esc(biz(s.def.id, s.def.label))}: chapter ${i + 1} of ${total}, ${esc(s.def.label)}"><i aria-hidden="true"></i></button></li>`,
    )
    .join('')

  const menuItems = slots
    .map(
      (s, i) =>
        `<li style="--i:${i}"><a class="ch-ml" href="#${s.def.id}" data-go="${s.def.id}" aria-label="${esc(biz(s.def.id, s.def.label))}, chapter ${i + 1} of ${total}: ${esc(s.def.label)}">
          <span class="ch-ml-n" aria-hidden="true">${pad(i + 1)}</span>
          <span class="ch-ml-name" aria-hidden="true">${esc(biz(s.def.id, s.def.label))}</span>
          <span class="ch-ml-lab" aria-hidden="true">${esc(s.def.label)}</span>
        </a></li>`,
    )
    .join('')

  let motionOn = readMotion(!reduced)
  const soundBtn = (extra = '') =>
    `<button class="ch-tgl ch-sound ch-chip${extra}" type="button" data-sound-toggle aria-pressed="false">${EQ}<span class="ch-tgl-k">${MICROCOPY.audio}</span><span class="ch-tgl-st" aria-hidden="true">${MICROCOPY.audioOff}</span></button>`
  const motionBtn = (extra = '') =>
    `<button class="ch-tgl ch-motion ch-chip${extra}" type="button" data-motion-toggle aria-pressed="${motionOn}">${ORBIT}<span class="ch-tgl-k">${MICROCOPY.motion}</span><span class="ch-tgl-st" aria-hidden="true">${motionOn ? MICROCOPY.audioOn : MICROCOPY.audioOff}</span></button>`
  const first = slots[0]?.def.id ?? 'hero'

  root.innerHTML = `
  <div class="chr">
    <div class="ch-scrim ch-scrim--top" aria-hidden="true"></div>
    <div class="ch-scrim ch-scrim--bottom" aria-hidden="true"></div>
    <header class="ch-top">
      <a class="ch-brand" href="#hero" data-go="hero" aria-label="${esc(BRAND.name)}, back to the start">
        ${brandInner}
      </a>
      <nav class="ch-nav ch-chip" aria-label="Primary">
        <ul class="ch-links">${links}</ul>
        <a class="hud-btn ch-cta" href="#contact" data-go="contact" data-focus>Start a project</a>
      </nav>
      <button class="ch-menu-btn ch-chip" type="button" aria-expanded="false" aria-controls="ch-menu" aria-haspopup="dialog">
        <span class="ch-menu-t">Menu</span>${MENU_IC}
      </button>
    </header>

    <div class="ch-bottom">
      <section class="ch-prefs" aria-label="Preferences">${soundBtn()}${motionBtn()}</section>
      <div class="ch-prog">
        <p class="ch-read" aria-hidden="true"><span class="ch-read-n"></span><span class="ch-read-l"></span><span class="ch-read-b"></span></p>
        <nav class="ch-chapters" aria-label="Chapters"><ol class="ch-pips">${pips}</ol></nav>
      </div>
      <a class="ch-readpage" href="${readHref(first)}" data-read>${READ_LABEL}</a>
    </div>

    <div class="ch-menu" id="ch-menu" role="dialog" aria-modal="true" aria-labelledby="ch-menu-title" data-lenis-prevent hidden>
      <div class="ch-menu-mark" aria-hidden="true">${markOutlineSvg('ch-menu-mark-svg', 5)}</div>
      <div class="ch-menu-top">
        <span class="ch-brand ch-menu-brand" aria-hidden="true">${brandInner}</span>
        <button class="ch-menu-btn ch-menu-close ch-chip" type="button">
          <span class="ch-menu-t">Close</span>${CLOSE_IC}
        </button>
      </div>
      <div class="ch-menu-body">
        <p class="hud-eyebrow ch-menu-eyebrow" id="ch-menu-title">Menu</p>
        <nav class="ch-menu-nav" aria-label="Chapters"><ol class="ch-menu-list">${menuItems}</ol></nav>
        <div class="ch-menu-foot">
          <a class="hud-btn ch-menu-cta" href="#contact" data-go="contact">Start a project</a>
          <a class="hud-btn hud-btn--ghost ch-menu-read" href="${readHref(first)}" data-read>${READ_LABEL}</a>
        </div>
        <div class="ch-menu-prefs" role="group" aria-label="Preferences">${soundBtn(' ch-menu-tgl')}${motionBtn(' ch-menu-tgl')}</div>
        <p class="ch-menu-mail"><a href="mailto:${BRAND.email}">${BRAND.email}</a></p>
      </div>
    </div>
  </div>`

  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s)!
  const chr = $('.chr')
  const top = $('.ch-top')
  const bottom = $('.ch-bottom')
  const menu = $('.ch-menu')
  const menuBtn = $<HTMLButtonElement>('.ch-top .ch-menu-btn')
  const menuClose = $<HTMLButtonElement>('.ch-menu-close')
  const navEls = [...root.querySelectorAll<HTMLAnchorElement>('.ch-link')]
  const pipEls = [...root.querySelectorAll<HTMLButtonElement>('.ch-pip')]
  const menuLinks = [...root.querySelectorAll<HTMLAnchorElement>('.ch-ml')]
  const soundBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-sound-toggle]')]
  const motionBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-motion-toggle]')]
  const bars = [...root.querySelectorAll<HTMLElement>('.ch-eq i')]
  const orbits = [...root.querySelectorAll<SVGGElement>('.ch-orbit-g')]
  const readN = $('.ch-read-n')
  const readL = $('.ch-read-l')
  const readB = $('.ch-read-b')
  const readEl = $('.ch-read')
  const readLinks = [...root.querySelectorAll<HTMLAnchorElement>('[data-read]')]

  // ---------------------------------------------------------------- navigation

  root.addEventListener('click', e => {
    const a = (e.target as Element).closest<HTMLElement>('[data-go]')
    if (!a || !root.contains(a)) return
    e.preventDefault()
    const id = a.dataset.go!
    const fromMenu = menuOpen && menu.contains(a)
    if (menuOpen) closeMenu(false)
    sound.blip(a.matches('.ch-cta, .ch-menu-cta') ? 5 : Math.max(0, indexOf(id)))
    if (indexOf(id) >= 0) engine.land(id)
    // keyboard activation (detail 0) hands focus on to the chapter's heading;
    // a tap in the sheet returns focus to Menu, the control that opened it
    // (no heading pill left floating over the scene for a pointer visitor)
    const keyboard = e.detail === 0
    if (keyboard && (fromMenu || a.matches('.ch-link, .ch-pip, .ch-brand') || a.hasAttribute('data-focus')))
      engine.focusChapter(id)
    else if (fromMenu) menuBtn.focus({ preventScroll: true })
  })

  // ------------------------------------------------------------- the readout

  let lastIndex = -1
  let cueIndex = -1
  const showReadout = (i: number, cue = false) => {
    const s = slots[i]
    if (!s) return
    readN.textContent = cue ? `Go to ${pad(i + 1)}` : `${pad(i + 1)} / ${pad(total)}`
    readL.textContent = s.def.label
    readB.textContent = biz(s.def.id, s.def.label)
    readEl.classList.toggle('is-cue', cue)
  }
  pipEls.forEach((b, i) => {
    const cue = () => {
      cueIndex = i
      showReadout(i, i !== lastIndex)
    }
    b.addEventListener('pointerenter', e => {
      if ((e as PointerEvent).pointerType !== 'touch') cue()
    })
    b.addEventListener('focus', cue)
    const uncue = () => {
      if (cueIndex !== i) return
      cueIndex = -1
      if (lastIndex >= 0) showReadout(lastIndex)
    }
    b.addEventListener('pointerleave', uncue)
    b.addEventListener('blur', uncue)
  })

  // --------------------------------------------------------------------- sound

  const syncSound = (on: boolean) => {
    for (const b of soundBtns) {
      b.setAttribute('aria-pressed', String(on))
      const st = b.querySelector('.ch-tgl-st')
      if (st) st.textContent = on ? MICROCOPY.audioOn : MICROCOPY.audioOff
    }
    chr.classList.toggle('is-sound', on)
    if (!on) for (const d of bars) d.style.transform = ''
  }
  for (const b of soundBtns) b.addEventListener('click', () => sound.toggle())
  sound.onChange.push(syncSound)
  syncSound(sound.enabled)

  // -------------------------------------------------------------------- motion

  const syncMotion = () => {
    document.documentElement.classList.toggle('motion-off', !motionOn)
    engine.motion = motionOn
    chr.classList.toggle('is-still', !motionOn)
    for (const b of motionBtns) {
      b.setAttribute('aria-pressed', String(motionOn))
      const st = b.querySelector('.ch-tgl-st')
      if (st) st.textContent = motionOn ? MICROCOPY.audioOn : MICROCOPY.audioOff
    }
    window.dispatchEvent(new CustomEvent('hark:motion', { detail: { on: motionOn } }))
  }
  for (const b of motionBtns)
    b.addEventListener('click', () => {
      motionOn = !motionOn
      rememberMotion(motionOn)
      sound.blip(motionOn ? 4 : 1)
      syncMotion()
    })

  // --------------------------------------------------------------- menu sheet

  let menuOpen = false
  let hideTimer = 0
  const focusables = () =>
    [...menu.querySelectorAll<HTMLElement>('a[href], button')].filter(el => !el.hidden && el.getClientRects().length > 0)
  const openMenu = () => {
    if (menuOpen) return
    menuOpen = true
    clearTimeout(hideTimer)
    menu.hidden = false
    // flush the closed state so the entrance runs
    void menu.offsetWidth
    chr.classList.add('is-menu')
    // the chapter layer underneath is hidden while the sheet is up (ui.css)
    document.documentElement.classList.add('menu-open')
    menuBtn.setAttribute('aria-expanded', 'true')
    holdInert('menu', [
      document.getElementById('stages'),
      document.getElementById('track'),
      document.querySelector<HTMLElement>('.skip-link'),
      top,
      bottom,
    ])
    engine.lenis.stop()
    // hold the frame once the sheet is up (it frosts a still image)
    hideTimer = window.setTimeout(
      () => {
        if (menuOpen) holdScene('menu')
      },
      reduced || !motionOn ? 0 : 420,
    )
    menu.scrollTop = 0
    const now = menuLinks[lastIndex] ?? menuLinks[0]
    now?.focus({ preventScroll: true })
  }
  const closeMenu = (restoreFocus = true) => {
    if (!menuOpen) return
    menuOpen = false
    clearTimeout(hideTimer)
    chr.classList.remove('is-menu')
    document.documentElement.classList.remove('menu-open')
    menuBtn.setAttribute('aria-expanded', 'false')
    releaseInert('menu')
    releaseScene('menu')
    engine.lenis.start()
    hideTimer = window.setTimeout(
      () => {
        if (!menuOpen) menu.hidden = true
      },
      reduced || !motionOn ? 20 : 360,
    )
    if (restoreFocus) menuBtn.focus({ preventScroll: true })
  }
  menuBtn.addEventListener('click', () => (menuOpen ? closeMenu() : openMenu()))
  menuClose.addEventListener('click', () => closeMenu())
  // capture: the dialog's own trap runs ahead of the no-`inert` fallback in inert.ts
  window.addEventListener(
    'keydown',
    e => {
      if (!menuOpen) return
      if (e.key === 'Escape') {
        e.preventDefault()
        closeMenu()
      } else if (e.key === 'Tab') {
        const f = focusables()
        if (!f.length) return
        const i = f.indexOf(document.activeElement as HTMLElement)
        const next = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : i < 0 || i === f.length - 1 ? 0 : i + 1
        e.preventDefault()
        f[next].focus()
      }
    },
    true,
  )
  const narrow = matchMedia(MENU_QUERY)
  const onNarrow = (e: MediaQueryListEvent) => {
    if (!e.matches) closeMenu(false)
  }
  if (typeof narrow.addEventListener === 'function') narrow.addEventListener('change', onNarrow)
  else narrow.addListener?.(onNarrow)

  syncMotion()

  // -------------------------------------------------------------------- update

  const lv = [0, 0, 0]
  const rest = [0.45, 1, 0.6]
  /** measured resting band levels (analyser bytes / 255) and the headroom above them */
  const FLOOR = [0.78, 0.36, 0.3]
  const SPAN = [0.2, 0.34, 0.34]
  let orbitDeg = 0
  let lastOrbit = ''

  return {
    update(frame: Frame, state: EngineState) {
      const slot = state.slots[state.index]
      if (!slot) return

      if (state.index !== lastIndex) {
        const firstRun = lastIndex < 0
        lastIndex = state.index
        // a pip still under the pointer keeps its cue, but "Go to" only while it is elsewhere
        if (cueIndex < 0) showReadout(state.index)
        else showReadout(cueIndex, cueIndex !== state.index)
        pipEls.forEach((p, i) => {
          p.classList.toggle('is-on', i === state.index)
          p.classList.toggle('is-past', i < state.index)
          if (i === state.index) p.setAttribute('aria-current', 'step')
          else p.removeAttribute('aria-current')
        })
        if (!firstRun && !reduced && motionOn && typeof readEl.animate === 'function') {
          // the new name comes into focus, like type through clearing frost
          readEl.animate([{ filter: 'blur(4px)', opacity: 0.2 }, { filter: 'blur(0px)', opacity: 1 }], {
            duration: 650,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          })
        }
        const activeId = slot.def.id
        navEls.forEach(a => {
          const on = a.dataset.go === activeId
          a.classList.toggle('is-active', on)
          if (on) a.setAttribute('aria-current', 'location')
          else a.removeAttribute('aria-current')
        })
        menuLinks.forEach((a, i) => {
          a.classList.toggle('is-now', i === state.index)
          if (i === state.index) a.setAttribute('aria-current', 'location')
          else a.removeAttribute('aria-current')
        })
        chr.dataset.chapter = activeId
        // Read as a page opens the static copy at the chapter you are on
        const href = readHref(activeId)
        for (const a of readLinks) a.setAttribute('href', href)
        noteChapter(activeId)
      }

      // the Motion glyph's bead turns slowly while motion is on (a turntable)
      if (motionOn && !reduced && !frame.still) {
        orbitDeg = (orbitDeg + frame.dt * 30) % 360
        const t = `rotate(${orbitDeg.toFixed(1)} 8 8)`
        if (t !== lastOrbit) {
          lastOrbit = t
          for (const g of orbits) g.setAttribute('transform', t)
        }
      }

      // the Sound glyph rides the real signal (a calm fixed shape when motion is off)
      if (sound.enabled && bars.length) {
        const live = !reduced && motionOn && sound.meter(lv)
        for (let k = 0; k < bars.length; k++) {
          const i = k % 3
          // each band over its own resting level: the drone's slow breath in
          // the low bar, the glass strikes lifting the upper two
          const v = live ? 0.2 + 0.8 * Math.min(1, Math.max(0, (lv[i] - FLOOR[i]) / SPAN[i])) : rest[i]
          bars[k].style.transform = `scaleY(${(1 + v * 3).toFixed(2)})`
        }
      }
    },
  }
}
