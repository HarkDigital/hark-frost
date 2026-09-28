// Fonts: Schibsted Grotesk (display + body, incl. italics) and Fragment Mono (labels).
import '@fontsource-variable/schibsted-grotesk'
import '@fontsource-variable/schibsted-grotesk/wght-italic.css'
import '@fontsource/fragment-mono/400.css'
import '../styles/base.css'
import '../ui/ui.css'
import './service.css'

import { installPrintPolyfills } from '../ui/polyfills'
import { BRAND, CONTACT, SERVICES, SITE } from '../content'
import { CONCEPT_TAG, WORDMARK, markSvg } from '../ui/mark'
import { SERVICE_PAGES } from './data/pages'
import { SERVICE_CONTENT } from './data/content'

/*
 * A SERVICE PAGE — one per service, at <base>services/<slug>/ (vite.config.ts
 * writes a copy of service.html per slug). The copy is the classic 2026
 * site's service page, verbatim (src/service/data), in Frost's language:
 * black, frosted glass panels, mono labels, the two neon tubes.
 *
 *   top       the brand tile (home) + Work · Services · Contact + Start a project
 *   hero      the service's etched plate between the neon (src/service/hero.ts,
 *             WebGL; a CSS stand-in without it), eyebrow, headline, lede, CTAs
 *   features  "What you get": four frosted panels
 *   stat      the service's number
 *   process   "How it works": four steps on a hairline that lights on hover
 *   article   "The longer version"
 *   faq       "Questions, answered"
 *   quote     a client, when the service has one
 *   next      the closing line + previous / next service
 *   contact   "Say hello." + the address; the services index; footer
 *
 * A plain, natively scrolling document: real headings, links and
 * <details>, readable without WebGL. Reveals come in on scroll (instantly
 * under reduced motion). "All services" returns to the story at this
 * service's plate (<base>#services/<slug>, src/main.ts).
 */

installPrintPolyfills()

const BASE = import.meta.env.BASE_URL
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const pad = (n: number) => String(n).padStart(2, '0')
const serviceHref = (slug: string) => `${BASE}services/${slug}/`

const slug = location.pathname.match(/\/services\/([a-z0-9-]+)\/?$/)?.[1] ?? ''
const index = SERVICE_PAGES.findIndex(p => p.slug === slug)

if (index < 0) {
  // an unknown service: back to the story's services
  location.replace(`${BASE}#services`)
} else render(index)

function render(i: number) {
  const page = SERVICE_PAGES[i]
  const content = SERVICE_CONTENT[page.slug]
  const svc = SERVICES.find(s => s.slug === page.slug)
  const prev = SERVICE_PAGES[(i - 1 + SERVICE_PAGES.length) % SERVICE_PAGES.length]
  const next = SERVICE_PAGES[(i + 1) % SERVICE_PAGES.length]
  const back = `${BASE}#services/${page.slug}`
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const mobile = matchMedia('(pointer: coarse)').matches || window.innerWidth < 768

  document.documentElement.classList.add('is-svc')
  document.title = `${page.title} · Hark Digital · ${SITE.name}`

  // ---------------------------------------------------------------- top
  document.getElementById('svc-top')!.innerHTML = `
    <header class="svc-top">
      <a class="ch-brand" href="${BASE}" aria-label="${esc(BRAND.name)}, home">
        <span class="ch-tile" aria-hidden="true">${markSvg('ch-mark-svg')}</span>
        <span class="ch-brand-text" aria-hidden="true">${WORDMARK}${CONCEPT_TAG}</span>
      </a>
      <nav class="svc-nav ch-chip" aria-label="Primary">
        <ul class="ch-links">
          <li><a class="ch-link" href="${BASE}#work">Work</a></li>
          <li><a class="ch-link is-active" href="${back}">Services</a></li>
          <li><a class="ch-link" href="${BASE}#contact">Contact</a></li>
        </ul>
        <a class="hud-btn ch-cta" href="#svc-contact">Start a project</a>
      </nav>
      <a class="svc-back-chip ch-chip" href="${back}"><span aria-hidden="true">←</span> All services</a>
    </header>`

  // ---------------------------------------------------------------- body
  const headline = `${esc(page.headline)}${page.headlineAccent ? ` <em>${esc(page.headlineAccent)}</em>` : ''}`
  const long = `${page.headline} ${page.headlineAccent ?? ''}`.trim().length
  const features = page.features
    .map(
      (f, k) => `
        <li class="svc-feature hud-panel svc-rv" style="--d:${k}">
          <p class="svc-n hud-label" aria-hidden="true">${pad(k + 1)}</p>
          <h3 class="svc-feature-t">${esc(f.title)}</h3>
          <p class="svc-feature-p">${esc(f.text)}</p>
        </li>`,
    )
    .join('')
  const steps = page.process
    .map(
      (s, k) => `
        <li class="svc-step svc-rv" style="--d:${k}">
          <p class="svc-n hud-label" aria-hidden="true">${pad(k + 1)}</p>
          <h3 class="svc-step-t">${esc(s.title)}</h3>
          <p class="svc-step-p">${esc(s.text)}</p>
        </li>`,
    )
    .join('')
  const article = content
    ? `
    <section class="svc-sec svc-article" aria-labelledby="svc-article-h">
      <h2 class="svc-eyebrow hud-eyebrow svc-rv" id="svc-article-h">The longer version</h2>
      <div class="svc-article-grid">
        ${content.article
          .map(
            (b, k) => `
          <article class="svc-block svc-rv${k === 2 ? ' svc-block--wide' : ''}" style="--d:${Math.min(k, 3)}">
            <h3 class="svc-block-t">${esc(b.heading)}</h3>
            ${b.paragraphs.map(p => `<p>${esc(p)}</p>`).join('')}
          </article>`,
          )
          .join('')}
      </div>
    </section>`
    : ''
  const faq = content
    ? `
    <section class="svc-sec svc-faq" aria-labelledby="svc-faq-h">
      <p class="hud-eyebrow svc-rv">Questions, answered</p>
      <h2 class="hud-h2 svc-h2 svc-rv" id="svc-faq-h">What people ask us about ${esc(page.title.toLowerCase())}.</h2>
      <div class="svc-faq-list">
        ${content.faqs
          .map(
            f => `
          <details class="svc-q svc-rv">
            <summary><span>${esc(f.q)}</span><i aria-hidden="true"></i></summary>
            <p>${esc(f.a)}</p>
          </details>`,
          )
          .join('')}
      </div>
    </section>`
    : ''
  const quote = page.quote
    ? `
    <section class="svc-sec svc-quote-sec" aria-label="A client">
      <figure class="svc-quote hud-panel svc-rv">
        <span class="svc-quote-mark" aria-hidden="true">“</span>
        <blockquote class="hud-quote">${esc(page.quote.text)}</blockquote>
        <figcaption class="hud-label">${esc(page.quote.name)} · ${esc(page.quote.company)}</figcaption>
      </figure>
    </section>`
    : ''
  const index11 = SERVICE_PAGES.map(
    p =>
      `<li><a href="${serviceHref(p.slug)}"${p.slug === page.slug ? ' aria-current="page"' : ''}><span class="svc-idx-n" aria-hidden="true">${esc(p.num)}</span>${esc(p.title)}</a></li>`,
  ).join('')
  const year = new Date().getFullYear()

  document.getElementById('main')!.innerHTML = `
    <section class="svc-hero" aria-labelledby="svc-h1">
      <canvas class="svc-gl" aria-hidden="true"></canvas>
      <div class="svc-neon-css" aria-hidden="true"><i></i><i></i></div>
      <div class="svc-hero-scrim" aria-hidden="true"></div>
      <div class="svc-hero-copy">
        <p class="hud-eyebrow svc-rv">${esc(page.num)} / ${pad(SERVICE_PAGES.length)} · ${esc(page.title)}</p>
        <h1 class="hud-title svc-h1 svc-rv${long > 30 ? ' is-long' : ''}" id="svc-h1">${headline}</h1>
        <p class="hud-body svc-lede svc-rv">${esc(page.lede)}</p>
        ${svc ? `<ul class="hud-tags svc-tags svc-rv" aria-label="Includes">${svc.tags.map(t => `<li class="hud-tag">${esc(t)}</li>`).join('')}</ul>` : ''}
        <div class="svc-ctas svc-rv">
          <a class="hud-btn" href="#svc-contact">Start a project</a>
          <a class="hud-btn hud-btn--ghost" href="${back}"><span aria-hidden="true">←</span> All services</a>
        </div>
      </div>
    </section>

    <section class="svc-sec svc-features" aria-labelledby="svc-features-h">
      <h2 class="svc-eyebrow hud-eyebrow svc-rv" id="svc-features-h">What you get</h2>
      <ul class="svc-feature-grid">${features}</ul>
    </section>

    <section class="svc-stat" aria-label="By the numbers">
      <p class="svc-stat-in svc-rv">
        <span class="svc-stat-v">${esc(page.stat.value)}</span>
        <span class="svc-stat-l hud-label">${esc(page.stat.label)}</span>
      </p>
    </section>

    <section class="svc-sec svc-process" aria-labelledby="svc-process-h">
      <p class="hud-eyebrow svc-rv">How it works</p>
      <h2 class="hud-h2 svc-h2 svc-rv" id="svc-process-h">We listen first. Then we <em>build.</em></h2>
      <ol class="svc-steps">${steps}</ol>
    </section>

    ${article}
    ${faq}
    ${quote}

    <section class="svc-sec svc-next" aria-label="Next">
      <p class="svc-cta-line svc-rv">${esc(page.cta)}</p>
      <nav class="svc-pn svc-rv" aria-label="More services">
        <a class="svc-pn-a" href="${serviceHref(prev.slug)}" rel="prev"><span class="hud-label">Previous</span><span class="svc-pn-t"><span aria-hidden="true">←</span> ${esc(prev.title)}</span></a>
        <a class="svc-pn-a svc-pn-a--next" href="${serviceHref(next.slug)}" rel="next"><span class="hud-label">Next</span><span class="svc-pn-t">${esc(next.title)} <span aria-hidden="true">→</span></span></a>
      </nav>
    </section>

    <section class="svc-contact" id="svc-contact" aria-labelledby="svc-contact-h" tabindex="-1">
      <div class="svc-contact-card hud-panel hud-panel--strong svc-rv">
        <p class="hud-eyebrow">${esc(CONTACT.eyebrow)}</p>
        <h2 class="hud-title svc-contact-t" id="svc-contact-h">Say <em>hello.</em></h2>
        <p class="hud-body">${esc(CONTACT.body)}</p>
        <div class="svc-ctas">
          <a class="hud-btn" href="${esc(CONTACT.href)}">${esc(BRAND.email)} <span aria-hidden="true">→</span></a>
          <button class="hud-btn hud-btn--ghost svc-copy" type="button">Copy email</button>
        </div>
      </div>
    </section>

    <footer class="svc-foot">
      <nav class="svc-idx" aria-label="All services">
        <p class="hud-label">All services</p>
        <ul>${index11}</ul>
      </nav>
      <div class="svc-foot-row">
        <a class="svc-home hud-label" href="${BASE}"><span aria-hidden="true">←</span> Back to the story</a>
        <p class="hud-label">© ${year} ${esc(BRAND.name)} · ${BRAND.locale.split(' · ').map(esc).join(' · ')}</p>
      </div>
    </footer>`

  // copy email
  const copy = document.querySelector<HTMLButtonElement>('.svc-copy')!
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(BRAND.email)
      copy.textContent = 'Copied'
    } catch {
      copy.textContent = BRAND.email
    }
    setTimeout(() => (copy.textContent = 'Copy email'), 1800)
  })

  // reveals: in on scroll, once (instantly under reduced motion)
  const rv = [...document.querySelectorAll<HTMLElement>('.svc-rv')]
  if (reduced || !('IntersectionObserver' in window)) rv.forEach(n => n.classList.add('is-in'))
  else {
    const io = new IntersectionObserver(
      es => {
        for (const e of es) {
          if (!e.isIntersecting) continue
          e.target.classList.add('is-in')
          io.unobserve(e.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    )
    rv.forEach(n => io.observe(n))
  }

  // the hero art (WebGL), after the copy is up; without it the CSS neon stands in
  const canvas = document.querySelector<HTMLCanvasElement>('.svc-gl')!
  const hero = document.querySelector<HTMLElement>('.svc-hero')!
  const gl2 = (() => {
    try {
      return !!document.createElement('canvas').getContext('webgl2')
    } catch {
      return false
    }
  })()
  if (!gl2) hero.classList.add('is-nogl')
  else
    import('./hero')
      .then(m => {
        // the plate: this service's cell in the Services chapter's etched atlas
        const plate = SERVICES.findIndex(s => s.slug === page.slug)
        m.mountHero(canvas, plate >= 0 ? plate : i, { reduced, mobile })
        requestAnimationFrame(() => hero.classList.add('is-gl'))
      })
      .catch(err => {
        console.error('[service] hero failed', err)
        hero.classList.add('is-nogl')
      })
}
