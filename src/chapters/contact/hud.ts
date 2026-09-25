import { el, rise } from '../../core/dom'
import { BRAND, CONTACT, OTHER_CONCEPTS } from '../../content'

/*
 * The contact panel: one frosted glass card on black (left on landscape,
 * along the bottom on portrait). The address is the big primary action, a
 * frosted Copy pill beside it, the sister concepts, Back to top and the
 * colophon.
 *
 * Layout is MEASURED (on resize / font load / size change, never per frame)
 * so the mark can sit in whatever space the card leaves: `art` is that free
 * rectangle in CSS px. Short screens step the card down through fit levels
 * until it leaves the mark enough room:
 *   fit-1..3  type and spacing step down
 *   fit-4     'Other concepts' folds behind a disclosure in the footer row and
 *             the colophon line drops (both are in the copy layer and ?read)
 *   fit-5     the Other-concepts block goes entirely (never while it is open)
 */

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface Hud {
  stage: HTMLElement
  probe: HTMLElement
  wrap: HTMLElement
  panel: HTMLElement
  title: HTMLElement
  mail: HTMLAnchorElement
  copyBtn: HTMLButtonElement
  dirty: boolean
  /** performance.now() of the last successful copy (drives a soft glint on the mark) */
  copiedAt: number
  /** the pointer / focus is on the address or the copy button */
  hover: boolean
  /** the compact card's 'Other concepts' disclosure is open */
  moreOpen: boolean
}

export interface HudLayout {
  W: number
  H: number
  portrait: boolean
  /** free area for the mark, CSS px */
  art: Rect
  panel: Rect
  /** the band between the chrome's top and bottom safe areas, CSS px */
  band: Rect
}

const ICON_MAIL =
  '<svg class="ct-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="5.5" width="18" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m4.6 7.4 7.4 5.5 7.4-5.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'

/**
 * Portrait layout (card along the bottom, mark above). Short landscape phones
 * keep the side-by-side layout with a compact card. Keep in sync with
 * contact.css.
 */
export const PORTRAIT_QUERY = '(max-width: 767px) and (orientation: portrait), (max-width: 767px) and (min-height: 501px), (max-aspect-ratio: 9/10)'

/** Copy text: async Clipboard API first, then a hidden-textarea fallback. */
export async function copyText(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* denied or unsupported: fall through */
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.setAttribute('aria-hidden', 'true')
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;'
  const active = document.activeElement as HTMLElement | null
  document.body.appendChild(ta)
  ta.select()
  ta.setSelectionRange(0, text.length)
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  ta.remove()
  active?.focus?.({ preventScroll: true })
  return ok
}

/** A polite live region OUTSIDE the aria-hidden stage, so the copy result is announced. */
function liveRegion() {
  const id = 'ct-copy-live'
  let node = document.getElementById(id)
  if (!node) {
    node = document.createElement('p')
    node.id = id
    node.className = 'sr-only'
    node.setAttribute('role', 'status')
    node.setAttribute('aria-live', 'polite')
    document.body.appendChild(node)
  }
  return node
}

export function buildHud(stage: HTMLElement): Hud {
  const probe = el('div', 'ct-probe', undefined, stage)
  probe.setAttribute('aria-hidden', 'true')
  const wrap = el('div', 'ct-wrap', undefined, stage)
  const panel = el('div', 'hud-panel hud-panel--strong ct-panel', undefined, wrap)

  el('p', 'hud-eyebrow ct-eyebrow', CONTACT.eyebrow, panel)
  const words = CONTACT.title.split(' ')
  const last = words.pop() ?? ''
  const title = rise(el('h2', 'hud-title ct-title', undefined, panel), `${words.join(' ')} <em>${last}</em>`)
  el('p', 'hud-body ct-body', CONTACT.body, panel)

  const cta = el('div', 'ct-cta', undefined, panel)
  const mail = el('a', 'hud-btn ct-mail', undefined, cta)
  mail.href = CONTACT.href
  mail.innerHTML = `${ICON_MAIL}<span class="ct-mail-addr"></span><span class="ct-go" aria-hidden="true">→</span>`
  mail.querySelector('.ct-mail-addr')!.textContent = BRAND.email

  const copyBtn = el('button', 'hud-btn hud-btn--ghost ct-copy', undefined, cta)
  copyBtn.type = 'button'
  copyBtn.setAttribute('aria-label', `Copy email address ${BRAND.email}`)
  copyBtn.innerHTML =
    '<span class="ct-copy-idle">Copy<span class="ct-copy-more"> email</span></span><span class="ct-copy-done" aria-hidden="true">Copied</span><span class="ct-copy-fail" aria-hidden="true">Copy failed</span>'

  el('hr', 'hud-rule ct-rule', undefined, panel)

  const more = el('div', 'ct-more', undefined, panel)
  el('p', 'hud-label ct-more-label', 'Other concepts', more)
  const list = el('ul', 'ct-links', undefined, more)
  list.id = 'ct-links'
  for (const c of OTHER_CONCEPTS) {
    const li = el('li', '', undefined, list)
    const a = el('a', 'ct-link', undefined, li)
    a.href = c.url
    a.target = '_blank'
    a.rel = 'noopener'
    el('span', '', c.name, a)
    el('span', 'ct-arr', '↗', a).setAttribute('aria-hidden', 'true')
  }

  const foot = el('div', 'ct-foot', undefined, panel)
  // compact cards (fit-4): 'Other concepts' folds into this toggle beside Back to top
  const moreBtn = el('button', 'ct-top ct-more-btn', undefined, foot)
  moreBtn.type = 'button'
  moreBtn.setAttribute('aria-expanded', 'false')
  moreBtn.setAttribute('aria-controls', list.id)
  el('span', '', 'Other concepts', moreBtn)
  el('span', 'ct-arr ct-more-arr', '+', moreBtn).setAttribute('aria-hidden', 'true')
  const top = el('button', 'ct-top', undefined, foot)
  top.type = 'button'
  el('span', '', 'Back to top', top)
  el('span', 'ct-arr', '↑', top).setAttribute('aria-hidden', 'true')
  top.addEventListener('click', e => {
    const hark = window.__hark
    if (!hark) return
    hark.land('hero')
    // keyboard activation: move focus to the hero's heading too
    if (e.detail === 0) hark.engine?.focusChapter('hero')
  })
  const legal = el('p', 'ct-legal', undefined, foot)
  const parts = [`© ${new Date().getFullYear()} ${BRAND.name}`, ...BRAND.locale.split(' · ')]
  parts.forEach((p, i) => {
    if (i) legal.append(' · ')
    el('span', 'ct-nw', p, legal)
  })

  const hud: Hud = { stage, probe, wrap, panel, title, mail, copyBtn, dirty: true, copiedAt: -1e9, hover: false, moreOpen: false }

  moreBtn.addEventListener('click', () => {
    hud.moreOpen = !hud.moreOpen
    more.classList.toggle('is-open', hud.moreOpen)
    moreBtn.setAttribute('aria-expanded', String(hud.moreOpen))
    hud.dirty = true
  })

  const on = () => (hud.hover = true)
  const off = () => (hud.hover = false)
  for (const n of [mail, copyBtn]) {
    n.addEventListener('pointerenter', on)
    n.addEventListener('pointerleave', off)
    n.addEventListener('focus', on)
    n.addEventListener('blur', off)
  }

  const live = liveRegion()
  let resetT = 0
  copyBtn.addEventListener('click', async () => {
    const ok = await copyText(BRAND.email)
    window.clearTimeout(resetT)
    copyBtn.classList.toggle('is-copied', ok)
    copyBtn.classList.toggle('is-failed', !ok)
    if (ok) hud.copiedAt = performance.now()
    live.textContent = ok ? `Copied ${BRAND.email} to the clipboard.` : `Copy failed. The address is ${BRAND.email}.`
    resetT = window.setTimeout(() => {
      copyBtn.classList.remove('is-copied', 'is-failed')
      live.textContent = ''
    }, 1900)
  })

  const dirty = () => (hud.dirty = true)
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(dirty)
    ro.observe(probe)
    ro.observe(panel)
  }
  window.addEventListener('resize', dirty)
  document.fonts?.ready.then(dirty).catch(() => {})
  return hud
}

const FIT = ['ct-fit-1', 'ct-fit-2', 'ct-fit-3', 'ct-fit-4', 'ct-fit-5'] as const

/** Bottom of the chrome's brand lockup (CSS px), or -1 when it isn't there. */
function brandBottom() {
  const b = document.querySelector<HTMLElement>('#chrome a.ch-brand') ?? document.querySelector<HTMLElement>('a.ch-brand')
  if (!b) return -1
  const r = b.getBoundingClientRect()
  return r.height > 0 ? r.bottom : -1
}

/** Measure the card and the free area beside / above it (resize-time only). */
export function measureHud(hud: Hud, W: number, H: number, allowFit = true): HudLayout {
  const stage = hud.stage
  const portrait = matchMedia(PORTRAIT_QUERY).matches
  stage.classList.remove(...FIT)
  const band = hud.probe.getBoundingClientRect()
  const bandH = Math.max(1, band.height)
  // portrait: the card takes the lower part of the band, the mark lives above
  // it (the payoff must stay big, so phones fold the card before it grows past this)
  const limit = portrait ? bandH * (H < 720 ? 0.6 : 0.62) : bandH
  if (allowFit) {
    for (let i = 0; i < FIT.length && hud.panel.offsetHeight > limit; i++) {
      // an open disclosure is the visitor's choice: never fold it away under them
      if (FIT[i] === 'ct-fit-5' && hud.moreOpen) break
      stage.classList.add(FIT[i])
    }
  }

  // offset* ignore the reveal transform, so the measure is stable mid-reveal
  const w = hud.wrap.getBoundingClientRect()
  const x0 = w.left + hud.panel.offsetLeft
  const y0 = w.top + hud.panel.offsetTop
  const panel = { x0, y0, x1: x0 + hud.panel.offsetWidth, y1: y0 + hud.panel.offsetHeight }

  let art: Rect
  if (!portrait) {
    const gap = Math.max(24, W * 0.03)
    art = { x0: panel.x1 + gap, x1: band.right, y0: band.top, y1: band.bottom }
  } else {
    const gap = Math.max(14, H * 0.02)
    // on phones the mark may rise into the top band, but only to just under
    // the brand lockup (it is as wide as the mark's shoulders); tablets keep
    // it under the nav pill
    const bb = brandBottom()
    const top = W < 600 ? Math.max(bb > 0 ? bb + 6 : band.top * 0.8, 40) : Math.max(band.top * 0.92, 40)
    art = { x0: band.left, x1: band.right, y0: top, y1: Math.max(top + 90, panel.y0 - gap) }
  }
  return { W, H, portrait, art, panel, band: { x0: band.left, y0: band.top, x1: band.right, y1: band.bottom } }
}
