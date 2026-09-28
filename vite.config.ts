import { defineConfig, type Plugin } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { SERVICE_PAGES } from './src/service/data/pages'
import { SERVICE_CONTENT } from './src/service/data/content'

/** where the concept is served (og:url etc.); the path part comes from --base */
const ORIGIN = 'https://harkdigital.github.io'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/**
 * The service pages: ONE html entry (service.html, src/service/main.ts)
 * served at <base>services/<slug>/.
 *   dev / shots  /services/<slug>/ is rewritten to /service.html
 *   build        dist/services/<slug>/index.html per service, each with its
 *                own title, description and og tags; dist/service.html goes
 */
function servicePages(): Plugin {
  let outDir = 'dist'
  let base = '/'
  let build = false
  const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
    const m = (req.url ?? '').match(/^\/services\/([a-z0-9-]+)\/?(\?.*)?$/)
    if (m) req.url = `/service.html${m[2] ?? ''}`
    next()
  }
  return {
    name: 'hark-service-pages',
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir)
      base = c.base
      build = c.command === 'build'
    },
    configureServer(server) {
      server.middlewares.use(rewrite)
    },
    closeBundle() {
      if (!build) return
      const src = path.join(outDir, 'service.html')
      if (!fs.existsSync(src)) return
      const html = fs.readFileSync(src, 'utf8')
      for (const p of SERVICE_PAGES) {
        const title = `${p.title} · Hark Digital · Frost`
        const desc = SERVICE_CONTENT[p.slug]?.metaDescription ?? p.lede
        const url = `${ORIGIN}${base}services/${p.slug}/`
        const page = html
          .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
          .replace(/(<meta\s+name="description"\s+content=")[^"]*"/, `$1${esc(desc)}"`)
          .replace(/(<meta\s+property="og:url"\s+content=")[^"]*"/, `$1${esc(url)}"`)
          .replace(/(<meta\s+property="og:title"\s+content=")[^"]*"/, `$1${esc(title)}"`)
          .replace(/(<meta\s+property="og:description"\s+content=")[^"]*"/, `$1${esc(desc)}"`)
        const dir = path.join(outDir, 'services', p.slug)
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'index.html'), page)
      }
      fs.rmSync(src)
    },
  }
}

// GitHub Pages serves from /<repo>/ — CI passes --base=/<repo>/.
export default defineConfig({
  server: { host: true },
  plugins: [servicePages()],
  build: {
    // Safari 15/16.3 can't parse class static blocks (three r186) — lower them
    target: ['es2020', 'safari15', 'chrome100', 'firefox100'],
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: { main: 'index.html', service: 'service.html' },
    },
  },
})
