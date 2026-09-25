import * as THREE from 'three'

/*
 * "Your site": a thick plate of sandblasted glass, backlit, with the site's
 * name cut into it the way a studio engraves a glass sign — a padlock and
 * yoursite.com in polished CLEAR letters, a double hairline border, and a row
 * of 24 hour ticks along the foot (the 24/7 watch lights them one by one).
 *
 * The plate's FACE is drawn in three's OPAQUE list (a standard material with
 * its emissive replaced): a light-box glow from behind, a faint uneven
 * sandblast mottle and grain, a soft frosted sheen from the studio — and the
 * cuts, darker (clear glass shows the black room) with a razor lip where
 * the polished wall of each cut catches the light. The polished SIDES are
 * real transmissive glass (kit polished()).
 *
 * The heal is a MATERIAL PROCESS, all in this shader and the crack ribbons
 * (web.ts), driven by uniforms from `local`:
 *   uFront   the RE-FROST: condensation creeps in from the plate's edges on a
 *            feathered, noise-edged front (VEIL_GLSL, shared with web.ts so
 *            the cracks vanish exactly beneath it); the fresh frost is a
 *            brighter, softer veil that fills the cuts, beaded with droplets
 *   uPolish  the POLISH: a gliding highlight crosses the face on a diagonal;
 *            behind it the veil is gone and the sandblasted face is pristine,
 *            every cut razor sharp again
 *   uScan    the WATCH: one slow hairline of light crosses the plate; the
 *            hour ticks it has passed stay lit
 *
 * The etch texture packs three masks: R = cuts (clear grooves), G = the fine
 * border hairlines (a lighter cut), B = the hour ticks (lit by the watch).
 */

/** Rounded-rect path (Safari 15 has no CanvasRenderingContext2D.roundRect). */
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const q = Math.min(r, w / 2, h / 2)
  g.moveTo(x + q, y)
  g.lineTo(x + w - q, y)
  g.arcTo(x + w, y, x + w, y + q, q)
  g.lineTo(x + w, y + h - q)
  g.arcTo(x + w, y + h, x + w - q, y + h, q)
  g.lineTo(x + q, y + h)
  g.arcTo(x, y + h, x, y + h - q, q)
  g.lineTo(x, y + q)
  g.arcTo(x, y, x + q, y, q)
  g.closePath()
}

const DISPLAY = `'Schibsted Grotesk Variable', 'Schibsted Grotesk', system-ui, sans-serif`
const NAME = 'yoursite.com'

/** Designed on a 1600 x 1000 board (the plate's 3.2 x 2.0 units at 500 px/unit). */
function drawPlate(cv: HTMLCanvasElement) {
  const g = cv.getContext('2d')!
  const s = cv.width / 1600
  g.globalCompositeOperation = 'source-over'
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.fillStyle = '#000'
  g.fillRect(0, 0, cv.width, cv.height)
  g.setTransform(s, 0, 0, s, 0, 0)
  g.globalCompositeOperation = 'lighter'
  g.lineCap = 'round'
  g.lineJoin = 'round'

  // the border: a double hairline, the classic etched frame
  g.beginPath()
  rr(g, 58, 58, 1484, 884, 34)
  g.strokeStyle = 'rgb(0,255,0)'
  g.lineWidth = 3.2
  g.stroke()
  g.beginPath()
  rr(g, 76, 76, 1448, 848, 20)
  g.lineWidth = 1.6
  g.stroke()

  // the name, centred, with a padlock before it
  const size = 176
  g.font = `560 ${size}px ${DISPLAY}`
  g.textAlign = 'left'
  g.textBaseline = 'alphabetic'
  const tw = g.measureText(NAME).width
  const lockW = 104
  const gap = 46
  const total = lockW + gap + tw
  const x0 = 800 - total / 2
  const base = 548
  // padlock: a shackle (stroke) over a body with a keyhole (evenodd fill)
  const lx = x0
  const bodyTop = base - 92
  g.beginPath()
  g.arc(lx + lockW / 2, bodyTop - 2, 30, Math.PI, 0)
  g.lineTo(lx + lockW / 2 + 30, bodyTop + 4)
  g.moveTo(lx + lockW / 2 - 30, bodyTop + 4)
  g.lineTo(lx + lockW / 2 - 30, bodyTop - 2)
  g.strokeStyle = 'rgb(255,0,0)'
  g.lineWidth = 15
  g.lineCap = 'butt'
  g.stroke()
  g.lineCap = 'round'
  g.beginPath()
  rr(g, lx, bodyTop, lockW, 92, 16)
  g.fillStyle = 'rgb(255,0,0)'
  g.fill()
  // the keyhole stays frosted
  g.globalCompositeOperation = 'destination-out'
  g.beginPath()
  g.arc(lx + lockW / 2, bodyTop + 38, 11, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.moveTo(lx + lockW / 2 - 4.5, bodyTop + 42)
  g.lineTo(lx + lockW / 2 + 4.5, bodyTop + 42)
  g.lineTo(lx + lockW / 2 + 3, bodyTop + 68)
  g.lineTo(lx + lockW / 2 - 3, bodyTop + 68)
  g.closePath()
  g.fill()
  g.globalCompositeOperation = 'lighter'
  g.fillStyle = 'rgb(255,0,0)'
  g.fillText(NAME, x0 + lockW + gap, base)

  // a hairline rule under the name
  g.beginPath()
  g.moveTo(800 - total / 2, base + 70)
  g.lineTo(800 + total / 2, base + 70)
  g.strokeStyle = 'rgb(0,255,0)'
  g.lineWidth = 2
  g.stroke()

  // 24 hour ticks along the foot (every sixth a little taller)
  const t0 = 800 - total / 2
  const t1 = 800 + total / 2
  for (let i = 0; i <= 24; i++) {
    const x = t0 + ((t1 - t0) * i) / 24
    const major = i % 6 === 0
    g.beginPath()
    g.moveTo(x, 836 - (major ? 30 : 16))
    g.lineTo(x, 836)
    g.strokeStyle = major ? 'rgb(255,0,255)' : 'rgb(200,0,255)'
    g.lineWidth = major ? 4.5 : 3.2
    g.stroke()
  }
}

export function plateTexture(mobile: boolean, anisotropy: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = mobile ? 1600 : 2400
  cv.height = Math.round((cv.width * 1000) / 1600)
  drawPlate(cv)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.NoColorSpace
  tex.anisotropy = anisotropy
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  // the name is set in the display face: redraw once it is in
  const fonts = document.fonts
  if (fonts) {
    Promise.all([fonts.load(`560 176px ${DISPLAY}`).catch(() => null), fonts.ready])
      .then(() => {
        drawPlate(cv)
        tex.needsUpdate = true
      })
      .catch(() => undefined)
  }
  return tex
}

/**
 * Shared by the face and the crack ribbons (identical math, so the cracks
 * vanish exactly beneath the condensation). `p` is in plate units.
 * veilCover(p, front, half): 1 where the re-frost front (a distance in from
 * the plate's edge, noise-feathered) has already passed.
 */
export const VEIL_GLSL = /* glsl */ `
  float vHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 w = f * f * (3.0 - 2.0 * f);
    return mix(mix(vHash(i), vHash(i + vec2(1.0, 0.0)), w.x), mix(vHash(i + vec2(0.0, 1.0)), vHash(i + vec2(1.0, 1.0)), w.x), w.y);
  }
  /** noisy distance in from the plate's edge */
  float veilDist(vec2 p, vec2 hs) {
    float e = min(hs.x - abs(p.x), hs.y - abs(p.y));
    float n = vNoise(p * 2.6) * 0.55 + vNoise(p * 6.1) * 0.3 + vNoise(p * 14.0) * 0.15;
    return e + (n - 0.5) * 0.3;
  }
  #define VEIL_SOFT 0.12
  float veilCover(vec2 p, float front, vec2 hs) {
    return 1.0 - smoothstep(front - VEIL_SOFT, front + 0.02, veilDist(p, hs));
  }
`

export interface FaceUniforms {
  uEtch: { value: THREE.Texture | null }
  uTexel: { value: THREE.Vector2 }
  uSize: { value: THREE.Vector2 }
  uGlow: { value: number }
  uGlowColor: { value: THREE.Color }
  uLight: { value: THREE.Vector2 }
  uGroove: { value: number }
  uLip: { value: number }
  uLipColor: { value: THREE.Color }
  uImpact: { value: THREE.Vector2 }
  uRing: { value: THREE.Vector2 }
  uCrush: { value: number }
  uCrushColor: { value: THREE.Color }
  /** re-frost front (distance in from the edge, plate units); < -0.3 = none yet */
  uFront: { value: number }
  /** polish sweep position along uPolishDir (plate units) */
  uPolish: { value: number }
  uPolishDir: { value: THREE.Vector2 }
  /** brightness of the gliding highlight */
  uPolishK: { value: number }
  /** the watch: x (plate units), strength */
  uScan: { value: THREE.Vector2 }
}

/**
 * The sandblasted face. A MeshStandardMaterial (so the studio's reflections
 * give the frosted sheen) with its emissive replaced by the backlit glow, the
 * cuts and the heal. All animation is uniforms; nothing recompiles.
 */
export function faceMaterial(tex: THREE.Texture, w: number, h: number): { mat: THREE.MeshStandardMaterial; u: FaceUniforms } {
  const img = tex.image as HTMLCanvasElement
  const u: FaceUniforms = {
    uEtch: { value: tex },
    uTexel: { value: new THREE.Vector2(1 / img.width, 1 / img.height) },
    uSize: { value: new THREE.Vector2(w, h) },
    uGlow: { value: 0.3 },
    uGlowColor: { value: new THREE.Color(1, 1, 1) },
    uLight: { value: new THREE.Vector2(0.1, 0.15) },
    uGroove: { value: 0.7 },
    uLip: { value: 1.2 },
    uLipColor: { value: new THREE.Color(1, 1, 1) },
    uImpact: { value: new THREE.Vector2() },
    uRing: { value: new THREE.Vector2(0, 0) },
    uCrush: { value: 0 },
    uCrushColor: { value: new THREE.Color(1, 1, 1) },
    uFront: { value: -1 },
    uPolish: { value: -9 },
    uPolishDir: { value: new THREE.Vector2(0.86, -0.5) },
    uPolishK: { value: 0 },
    uScan: { value: new THREE.Vector2(-9, 0) },
  }
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0a0b0d,
    roughness: 0.5,
    metalness: 0,
  })
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPane;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPane = position.xy;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec2 vPane;
        uniform sampler2D uEtch;
        uniform vec2 uTexel, uSize, uLight, uImpact, uRing, uPolishDir, uScan;
        uniform float uGlow, uGroove, uLip, uCrush, uFront, uPolish, uPolishK;
        uniform vec3 uGlowColor, uLipColor, uCrushColor;
        ${VEIL_GLSL}
        float fVeil = 0.0;
        float fCut = 0.0;
        float fDist = 0.0;
        /** condensation beads: a lens each (a bright rim, a clearer centre), faded out before they alias */
        float drops(vec2 p, float seed, float fw) {
          vec2 ci = floor(p);
          vec2 f = fract(p);
          float acc = 0.0;
          for (int j = -1; j <= 1; j++) {
            for (int i = -1; i <= 1; i++) {
              vec2 c = ci + vec2(float(i), float(j));
              if (vHash(c + seed) < 0.58) continue;
              vec2 o = vec2(vHash(c + seed + 3.1), vHash(c + seed + 8.7));
              float r = 0.1 + 0.3 * vHash(c + seed + 5.3);
              float d = length(f - vec2(float(i), float(j)) - o);
              float disc = 1.0 - smoothstep(r - fw, r + fw, d);
              acc += disc * (smoothstep(r * 0.3, r, d) * 0.9 - 0.25);
            }
          }
          return acc * (1.0 - smoothstep(0.15, 0.35, fw));
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        vec2 pUv = vPane / uSize + 0.5;
        vec4 etchT = texture2D(uEtch, pUv);
        {
          // the heal state: condensation arrived (from the edges) and not yet polished away
          fDist = veilDist(vPane, uSize * 0.5);
          float covered = 1.0 - smoothstep(uFront - VEIL_SOFT, uFront + 0.02, fDist);
          float pd = dot(vPane, uPolishDir);
          float polished = 1.0 - smoothstep(uPolish - 0.07, uPolish + 0.07, pd);
          fVeil = covered * (1.0 - polished);
          // razor-sharp cut edges: where the texture is magnified, re-threshold the
          // bilinear mask at pixel scale; where it is minified, keep the mip's coverage
          float m = etchT.r;
          float aa = max(fwidth(m) * 0.75, 0.02);
          vec2 tp = pUv / uTexel;
          float rho = max(length(dFdx(tp)), length(dFdy(tp)));
          fCut = mix(smoothstep(0.5 - aa, 0.5 + aa, m), m, smoothstep(0.7, 1.4, rho)) * (1.0 - 0.85 * fVeil);
        }
        // clear cuts: near-mirror, so the studio strips run crisp inside them
        roughnessFactor = mix(roughnessFactor, 0.07, fCut * 0.9);
        // fresh condensation is a softer, whiter scatter
        roughnessFactor = mix(roughnessFactor, 0.62, fVeil);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        {
          vec2 q = vPane / (uSize * 0.5);                  // -1..1 across the plate
          // the light box: a hot core behind the plate falling off to near-black corners
          vec2 dl = (vPane - uLight) / uSize.y;
          float r2 = dot(dl, dl);
          float box = exp(-r2 * 3.0) * 0.8 + exp(-r2 * 0.8) * 0.2;
          // the frame of the plate catches less light than its middle
          float fx = 1.0 - smoothstep(0.8, 1.02, abs(q.x));
          float fy = 1.0 - smoothstep(0.7, 1.02, abs(q.y));
          box *= 0.4 + 0.6 * fx * fy;
          box += 0.02;
          // sandblast: a faint uneven mottle and a fine grain (surface-fixed, faded before it can shimmer)
          float mottle = vNoise(vPane * 9.0) * 0.6 + vNoise(vPane * 23.0) * 0.4;
          vec2 gp = vPane * 150.0;
          float gk = 1.0 - smoothstep(0.35, 0.8, max(fwidth(gp.x), fwidth(gp.y)));
          float grain = (vHash(floor(gp)) - 0.5) * gk;
          box *= 0.9 + 0.2 * mottle + 0.14 * grain;
          vec3 glow = uGlowColor * uGlow * box;
          // condensation scatters more light: a brighter, whiter veil, beaded with droplets,
          // its leading edge a soft band of fresh breath
          float pfw = max(fwidth(vPane.x), 1e-5);
          if (fVeil > 0.001) {
            float dr = drops(vPane * 26.0, 17.0, pfw * 26.0) + 0.6 * drops(vPane * 47.0, 41.0, pfw * 47.0);
            glow *= 1.0 + fVeil * (0.32 + 0.22 * dr);
          }
          float lead = exp(-pow2((fDist - uFront) / 0.05)) * step(-0.3, uFront) * (1.0 - fVeil * 0.5);
          glow += uGlowColor * uGlow * lead * 0.3 * (0.4 + box);
          // the cuts: darker (you see the black room through clear glass) …
          float border = etchT.g;
          glow *= max(0.0, 1.0 - fCut * uGroove - border * 0.35 * (1.0 - fVeil));
          // … with a razor lip where each polished wall catches the light (strong upper-left, faint lower-right)
          vec2 lo = vec2(-0.0045, 0.0045) / uSize;
          vec4 eUL = texture2D(uEtch, pUv + lo);
          float rDR = texture2D(uEtch, pUv - lo).r;
          float lip = clamp(etchT.r - eUL.r, 0.0, 1.0) + 0.35 * clamp(etchT.r - rDR, 0.0, 1.0) + 0.4 * clamp(border - eUL.g, 0.0, 1.0);
          glow += uLipColor * lip * uLip * (0.3 + box) * uGlow * (1.0 - fVeil);
          // the polish: a gliding highlight, a soft sheen with a crisp core
          float pd2 = dot(vPane, uPolishDir) - uPolish;
          float sheen = exp(-pd2 * pd2 / 0.02) * 0.55 + exp(-pd2 * pd2 / 0.0006) * 0.45;
          glow += uGlowColor * sheen * uPolishK * (0.35 + box);
          // the watch: one hairline of light; the hour ticks it has passed stay lit
          float sx = vPane.x - uScan.x;
          float sfw = max(fwidth(vPane.x), 1e-5);
          float scan = (1.0 - smoothstep(0.0025, 0.0025 + sfw * 1.5, abs(sx))) * 0.8 + exp(-sx * sx / 0.004) * 0.22;
          scan *= fy;
          glow += uGlowColor * scan * uScan.y * (0.4 + box);
          float ticks = etchT.b * uScan.y * (1.0 - smoothstep(-0.02, 0.02, sx));
          glow += uGlowColor * ticks * 1.1 * (0.4 + box) * uGlow;
          // the strike: a crisp shock ring and a crushed-white impact point (gone under the veil)
          float r = length(vPane - uImpact);
          float fresh = 1.0 - veilCover(uImpact, uFront, uSize * 0.5);
          float ring = exp(-pow2((r - uRing.x) / 0.006)) + 0.35 * exp(-pow2((r - uRing.x * 0.93) / 0.02));
          glow += uCrushColor * ring * uRing.y;
          glow += uCrushColor * uCrush * fresh * (exp(-r * r / 0.0012) * 0.9 + exp(-r * r / 0.012) * 0.22);
          totalEmissiveRadiance = glow;
        }`,
      )
  }
  mat.customProgramCacheKey = () => 'frost-shield-plate'
  return { mat, u }
}
