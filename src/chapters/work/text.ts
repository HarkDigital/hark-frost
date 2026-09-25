import * as THREE from 'three'

/*
 * Etched text for the Collection: the engraved labels on the frosted panels
 * and on the nine directory bars. Canvas planes (white glyphs, alpha), drawn
 * just in front of a glass face; repainted once Fragment Mono / Schibsted
 * Grotesk have actually loaded so the glyphs are the real faces.
 */

export const MONO = "'Fragment Mono', ui-monospace, monospace"
export const SANS = "'Schibsted Grotesk Variable', 'Schibsted Grotesk', system-ui, sans-serif"

let fontsPromise: Promise<void> | null = null

/** Resolves once both faces are loaded (or after 5s, whichever is first). */
export function fontsReady(): Promise<void> {
  if (fontsPromise) return fontsPromise
  const f = typeof document !== 'undefined' ? document.fonts : undefined
  if (!f || typeof f.load !== 'function') return (fontsPromise = Promise.resolve())
  fontsPromise = Promise.race([
    Promise.all([f.load(`400 48px ${MONO}`), f.load(`560 48px ${SANS}`)]).then(() => undefined),
    new Promise<void>(r => window.setTimeout(r, 5000)),
  ]).catch(() => undefined)
  return fontsPromise
}

/** Draw `text` with manual tracking (canvas letterSpacing is missing in Safari 15). Returns the drawn width. */
export function spaced(g: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number, measureOnly = false): number {
  let cx = x
  const chars = Array.from(text)
  chars.forEach((ch, i) => {
    if (!measureOnly) g.fillText(ch, cx, y)
    cx += g.measureText(ch).width + (i < chars.length - 1 ? tracking : 0)
  })
  return cx - x
}

export interface TextPlate {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
}

/**
 * A transparent text plane `w` world units wide; `draw` paints white glyphs
 * on a `pw`×`ph` canvas.
 */
export function textPlate(
  pw: number,
  ph: number,
  w: number,
  draw: (g: CanvasRenderingContext2D, pw: number, ph: number) => void,
  o: { opacity?: number } = {},
): TextPlate {
  const cv = document.createElement('canvas')
  cv.width = pw
  cv.height = ph
  const g = cv.getContext('2d')!
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  const paint = () => {
    g.clearRect(0, 0, pw, ph)
    g.fillStyle = '#ffffff'
    g.textBaseline = 'middle'
    draw(g, pw, ph)
    tex.needsUpdate = true
  }
  paint()
  fontsReady().then(paint)
  const material = new THREE.MeshBasicMaterial({
    map: tex,
    color: new THREE.Color('#ffffff'),
    transparent: true,
    opacity: o.opacity ?? 0.8,
    depthWrite: false,
    toneMapped: true,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, (w * ph) / pw), material)
  return { mesh, material }
}
