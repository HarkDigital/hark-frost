import * as THREE from 'three'

/*
 * "Your site": a frosted glass pane with a minimal website etched into it.
 *
 * The pane's FACE is drawn in three's OPAQUE list (a standard material with
 * its emissive replaced): a backlit sandblasted surface — a soft light-box
 * glow from behind, a faint uneven sandblast mottle, a frosted sheen from the
 * studio — with the site cut into it as CLEAR grooves (darker, because clear
 * glass shows the black room behind; a razor highlight along one lip where
 * the polished groove catches the light; roughness drops to near-mirror in
 * the grooves). Being opaque, the face is what the laminate that later
 * slides in front refracts: blurred while it's frosted, crisp once it thaws.
 * The pane's polished SIDES are real transmissive glass (kit polished()).
 *
 * The etch texture packs two masks: R = groove lines, G = deep-frosted
 * fills (a button, the image), which glow a touch brighter than the pane.
 */

/** Rounded-rect path (Safari 15 has no CanvasRenderingContext2D.roundRect). */
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const q = Math.min(r, w / 2, h / 2)
  g.beginPath()
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

/** Designed on a 1600 x 1000 board (the pane's 3.2 x 2.0 units at 500 px/unit). */
function drawSite(cv: HTMLCanvasElement) {
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
  const L = (v = 255) => `rgb(${v},0,0)`
  const F = (v = 255) => `rgb(0,${v},0)`
  const LW = 5
  const stroke = (c: string, lw = LW) => {
    g.strokeStyle = c
    g.lineWidth = lw
    g.stroke()
  }
  const fill = (c: string) => {
    g.fillStyle = c
    g.fill()
  }
  const hline = (x0: number, x1: number, y: number, v = 255, lw = LW) => {
    g.beginPath()
    g.moveTo(x0, y)
    g.lineTo(x1, y)
    stroke(L(v), lw)
  }
  /** a clear groove bar */
  const bar = (x: number, y: number, w: number, h: number, v = 255) => {
    rr(g, x, y - h / 2, w, h, h / 2)
    fill(L(v))
  }
  /** a deep-frosted bar (glows brighter than the pane) */
  const frostBar = (x: number, y: number, w: number, h: number, v = 255) => {
    rr(g, x, y - h / 2, w, h, h / 2)
    fill(F(v))
  }

  // the browser: an inner frame, a title bar, the address
  rr(g, 40, 40, 1520, 920, 34)
  stroke(L(230))
  for (const x of [84, 112, 140]) {
    g.beginPath()
    g.arc(x, 86, 7.5, 0, Math.PI * 2)
    stroke(L(230), 4)
  }
  rr(g, 590, 66, 420, 40, 20)
  stroke(L(210), 4)
  g.fillStyle = L(255)
  g.font = `400 21px 'Fragment Mono', ui-monospace, monospace`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('yoursite.com', 800, 87)
  hline(40, 1560, 132, 200, 4)

  // nav: a mark and wordmark, four links, a pill
  g.beginPath()
  g.arc(112, 196, 15, 0, Math.PI * 2)
  stroke(L(255))
  frostBar(142, 196, 128, 16)
  for (const x of [900, 1000, 1100, 1200]) bar(x, 196, 64, 7, 230)
  rr(g, 1318, 174, 180, 44, 22)
  stroke(L(255))

  // hero, left: a big two-line headline (deep frost), three hairlines of text, two buttons
  frostBar(96, 318, 640, 62)
  frostBar(96, 400, 470, 62)
  bar(96, 488, 560, 6, 235)
  bar(96, 516, 520, 6, 235)
  bar(96, 544, 380, 6, 235)
  rr(g, 96, 606, 216, 60, 30)
  fill(F(255))
  rr(g, 334, 606, 190, 60, 30)
  stroke(L(255))

  // hero, right: an arched image, deep-frosted, a sun and a horizon cut clear
  const ax = 900
  const ay = 262
  const aw = 604
  const ah = 420
  const arch = () => {
    g.beginPath()
    g.moveTo(ax, ay + ah)
    g.lineTo(ax, ay + aw / 2)
    g.arc(ax + aw / 2, ay + aw / 2, aw / 2, Math.PI, 0)
    g.lineTo(ax + aw, ay + ah)
    g.closePath()
  }
  arch()
  fill(F(120))
  arch()
  stroke(L(255))
  g.beginPath()
  g.arc(ax + aw * 0.64, ay + 196, 54, 0, Math.PI * 2)
  fill(F(255))
  g.save()
  arch()
  g.clip()
  g.beginPath()
  g.moveTo(ax, ay + 350)
  g.bezierCurveTo(ax + 160, ay + 300, ax + 300, ay + 300, ax + 420, ay + 348)
  g.bezierCurveTo(ax + 500, ay + 380, ax + 560, ay + 330, ax + aw, ay + 320)
  stroke(L(255))
  g.restore()

  // a hairline rule, then three columns
  hline(96, 1504, 748, 200, 4)
  for (const x of [96, 588, 1080]) {
    g.beginPath()
    g.arc(x + 14, 806, 14, 0, Math.PI * 2)
    stroke(L(255), 4)
    frostBar(x + 48, 806, 190, 16)
    bar(x, 856, 380, 5, 220)
    bar(x, 880, 340, 5, 220)
    bar(x, 904, 360, 5, 220)
  }
}

export function siteTexture(mobile: boolean, anisotropy: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = mobile ? 1600 : 2400
  cv.height = Math.round((cv.width * 1000) / 1600)
  drawSite(cv)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.NoColorSpace
  tex.anisotropy = anisotropy
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  // the address is Fragment Mono: redraw once the web fonts are in
  document.fonts?.ready.then(() => {
    drawSite(cv)
    tex.needsUpdate = true
  })
  return tex
}

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
  uFill: { value: number }
  uImpact: { value: THREE.Vector2 }
  uRing: { value: THREE.Vector2 }
  uCrush: { value: number }
  uCrushColor: { value: THREE.Color }
}

/**
 * The frosted face. A MeshStandardMaterial (so the studio's reflections give
 * the sandblasted sheen) with its emissive replaced by the backlit glow and
 * the etched site. All animation is uniforms; nothing recompiles.
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
    uGroove: { value: 0.62 },
    uLip: { value: 1.1 },
    uLipColor: { value: new THREE.Color(1, 1, 1) },
    uFill: { value: 0.55 },
    uImpact: { value: new THREE.Vector2() },
    uRing: { value: new THREE.Vector2(0, 0) },
    uCrush: { value: 0 },
    uCrushColor: { value: new THREE.Color(1, 1, 1) },
  }
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0a0b0d,
    roughness: 0.46,
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
        uniform vec2 uTexel, uSize, uLight, uImpact, uRing;
        uniform float uGlow, uGroove, uLip, uFill, uCrush;
        uniform vec3 uGlowColor, uLipColor, uCrushColor;
        float fHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float fNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 w = f * f * (3.0 - 2.0 * f);
          return mix(mix(fHash(i), fHash(i + vec2(1.0, 0.0)), w.x), mix(fHash(i + vec2(0.0, 1.0)), fHash(i + vec2(1.0, 1.0)), w.x), w.y);
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        vec2 pUv = vPane / uSize + 0.5;
        vec4 etchT = texture2D(uEtch, pUv);
        float groove = etchT.r;
        // clear grooves: near-mirror, so the studio strips run crisp inside them
        roughnessFactor = mix(roughnessFactor, 0.08, groove * 0.85);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        {
          vec2 q = vPane / (uSize * 0.5);                  // -1..1 across the pane
          // the light box: a hot core behind the pane falling off to near-black corners
          vec2 dl = (vPane - uLight) / uSize.y;
          float r2 = dot(dl, dl);
          float box = exp(-r2 * 3.4) * 0.84 + exp(-r2 * 0.9) * 0.16;
          // the frame of the pane catches less light than its middle
          float fx = smoothstep(1.02, 0.8, abs(q.x));
          float fy = smoothstep(1.02, 0.7, abs(q.y));
          box *= 0.4 + 0.6 * fx * fy;
          box += 0.018;
          // sandblast: a faint uneven mottle (surface-fixed, not screen noise)
          float mottle = fNoise(vPane * 9.0) * 0.6 + fNoise(vPane * 23.0) * 0.4;
          box *= 0.92 + 0.16 * mottle;
          vec3 glow = uGlowColor * uGlow * box;
          // deep-frosted fills glow brighter
          glow *= 1.0 + etchT.g * uFill;
          // clear grooves: darker (you see the black room through them) …
          glow *= 1.0 - groove * uGroove;
          // … with a razor lip where the polished groove wall catches the light
          float up = texture2D(uEtch, pUv + vec2(-3.0, 3.0) * uTexel).r;
          float lip = clamp(groove - up, 0.0, 1.0);
          glow += uLipColor * lip * uLip * (0.25 + box) * uGlow;
          // the strike: a crisp shock ring and a crushed-white impact point
          float r = length(vPane - uImpact);
          float ring = exp(-pow2((r - uRing.x) / 0.006)) + 0.35 * exp(-pow2((r - uRing.x * 0.93) / 0.02));
          glow += uCrushColor * ring * uRing.y;
          glow += uCrushColor * uCrush * (exp(-r * r / 0.0012) * 0.9 + exp(-r * r / 0.012) * 0.22);
          totalEmissiveRadiance = glow;
        }`,
      )
  }
  mat.customProgramCacheKey = () => 'frost-shield-face'
  return { mat, u }
}
