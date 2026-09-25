import * as THREE from 'three'
import { smoothExtrude, sharpTransmission } from '../../kit/glass'
import type { PatternSdf } from './sdf'

/*
 * ANNEALED — scene parts for the process chapter (how frosted glass is made).
 *
 *  - BLOCK: a raw block of clear, polished glass under a single spotlight; a
 *    ring of light (the inspection scan) slides down around it.
 *  - PANE: the working piece. Its faces are ONE physical glass material whose
 *    roughness is decided per fragment: the resist pattern (the Hark mark and
 *    a fine keyline, read from a signed distance field, antialiased in screen
 *    space) stays clear; everything else frosts behind a noisy sandblast
 *    front. Frosted areas glow with the light behind (a soft scatter term) and
 *    the step between frost and clear catches a hairline of light. Its bevels
 *    are polished glass that carries a gliding glint (the polish).
 *  - STENCIL: a thin matte-black resist film in two complementary pieces cut
 *    from the same field (the FIELD sheet, weeded away after the cut, and the
 *    RESIST, the mark-shaped pieces that stay on through the blast). Both are
 *    transparent (smooth SDF edges) and drawn over the glass.
 *  - KERF: an additive overlay that draws the cut in light, revealed by a
 *    gantry line travelling down the sheet.
 *  - NOZZLE + SPRAY: a chrome nozzle and a fine stream of additive grains that
 *    strike the pane and ricochet.
 *  - LIGHT CARD: an additive plane kept in the OPAQUE list behind the pane, so
 *    three's transmission pass sees it and the frost has light to diffuse.
 */

export const PANE = { w: 1.8, h: 2.4, d: 0.1, bevel: 0.034, radius: 0.045 }
/** the front face (local z) */
export const FACE_Z = PANE.d / 2 + PANE.bevel
export const MARK_H = 1.28
export const BLOCK = { w: 1.3, h: 1.7, d: 0.95, bevel: 0.07, radius: 0.08 }

export function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

const NOISE = /* glsl */ `
  float prHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float prNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(prHash(i), prHash(i + vec2(1.0, 0.0)), u.x), mix(prHash(i + vec2(0.0, 1.0)), prHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
`

// ------------------------------------------------------------------ pane

export interface PaneUniforms {
  uSdf: { value: THREE.Texture }
  uSdfScale: { value: number }
  uRect: { value: THREE.Vector4 }
  uSize: { value: THREE.Vector2 }
  /** roughness of the sandblasted field */
  uFrostR: { value: number }
  /** sandblast front in pane uv.x (−0.2 = untouched … 1.2 = done) */
  uFront: { value: number }
  uImpact: { value: THREE.Vector2 }
  uImpactR: { value: number }
  /** backlit scatter glow of the frost */
  uGlow: { value: number }
  uGlowC: { value: THREE.Vector2 }
  uGlowColor: { value: THREE.Color }
  /** hairline of light where frost meets the clear pattern */
  uRim: { value: number }
}

export interface Pane {
  mesh: THREE.Mesh
  caps: THREE.MeshPhysicalMaterial
  sides: THREE.MeshPhysicalMaterial
  u: PaneUniforms
  su: { uGlint: { value: number }; uSweep: { value: number }; uHalf: { value: THREE.Vector2 }; uGlintColor: { value: THREE.Color } }
}

export function makePane(sdf: PatternSdf, mobile: boolean): Pane {
  const geo = smoothExtrude(roundedRect(PANE.w, PANE.h, PANE.radius), {
    depth: PANE.d,
    bevel: PANE.bevel,
    bevelSegments: mobile ? 4 : 7,
    curveSegments: 10,
    crease: Math.PI / 4.5,
  })
  const u: PaneUniforms = {
    uSdf: { value: sdf.tex },
    uSdfScale: { value: sdf.scale },
    uRect: { value: new THREE.Vector4(-PANE.w / 2, -PANE.h / 2, PANE.w, PANE.h) },
    uSize: { value: new THREE.Vector2(PANE.w, PANE.h) },
    uFrostR: { value: 0.5 },
    uFront: { value: -0.3 },
    uImpact: { value: new THREE.Vector2(-5, -5) },
    uImpactR: { value: 0 },
    uGlow: { value: 0 },
    uGlowC: { value: new THREE.Vector2(0.5, 0.56) },
    uGlowColor: { value: new THREE.Color('#e9eef6') },
    uRim: { value: 0 },
  }
  // faces: clear glass whose roughness the pattern + blast decide per fragment
  const caps = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.02,
    transmission: 1,
    thickness: 0.32,
    ior: 1.5,
    specularIntensity: 1,
    envMapIntensity: 1,
    attenuationColor: new THREE.Color('#eef3ff'),
    attenuationDistance: 6,
  })
  caps.dispersion = 0
  caps.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uRect;\nvarying vec2 vPUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPUv = (position.xy - uRect.xy) / uRect.zw;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uSdf;
        uniform float uSdfScale, uFrostR, uFront, uImpactR, uGlow, uRim;
        uniform vec2 uSize, uImpact, uGlowC;
        uniform vec3 uGlowColor;
        varying vec2 vPUv;
        ${NOISE}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        // + inside the resist pattern (stays clear), − in the field
        float prSd = (texture2D(uSdf, vPUv).r - 0.5) * uSdfScale;
        float prAa = max(fwidth(prSd), 1e-5);
        float prKeep = smoothstep(-prAa, prAa, prSd);
        vec2 prW = vPUv * uSize;
        float prN = prNoise(prW * 6.0) * 0.62 + prNoise(prW * 21.0) * 0.38;
        // the sandblast front (grainy edge) and the fresh bloom around the impact
        float prBlast = smoothstep(0.0, 0.03, uFront - vPUv.x + (prN - 0.5) * 0.16);
        float prD = length((vPUv - uImpact) * uSize) + (prN - 0.5) * 0.07;
        prBlast = max(prBlast, 1.0 - smoothstep(uImpactR * 0.45, uImpactR + 1e-4, prD));
        float prFrost = prBlast * (1.0 - prKeep);
        roughnessFactor = mix(roughnessFactor, uFrostR, prFrost);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // light scattered by the sandblasted surface: brightest over the backlight
        vec2 prG = (vPUv - uGlowC) * uSize;
        float prFall = 0.12 + 0.88 * exp(-dot(prG, prG) * 1.05);
        float prGrain = prHash(floor(gl_FragCoord.xy));
        totalEmissiveRadiance += uGlowColor * (uGlow * prFrost * prFall * (0.88 + 0.24 * prGrain));
        // the step between frost and clear catches a hairline of light
        float prLine = exp(-(prSd * prSd) / (prAa * prAa * 1.6));
        totalEmissiveRadiance += uGlowColor * (uRim * prLine * prBlast * (0.55 + 0.45 * prFall));`,
      )
  }
  caps.customProgramCacheKey = () => 'frost-process-pane-caps'

  const su = {
    uGlint: { value: 0 },
    uSweep: { value: 0 },
    uHalf: { value: new THREE.Vector2(PANE.w / 2, PANE.h / 2) },
    uGlintColor: { value: new THREE.Color('#f4f7ff') },
  }
  // polished bevels: crisp strip reflections + a glint that glides around the rim
  const sides = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.015,
    transmission: 1,
    thickness: 0.6,
    ior: 1.5,
    specularIntensity: 1,
    envMapIntensity: 1.2,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
  })
  sides.dispersion = mobile ? 0 : 0.3
  sides.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, su)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPLoc;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPLoc = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlint, uSweep;\nuniform vec2 uHalf;\nuniform vec3 uGlintColor;\nvarying vec3 vPLoc;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float glA = atan(vPLoc.y / uHalf.y, vPLoc.x / uHalf.x + 1e-5);
        float glD = abs(mod(glA - uSweep + PI, 2.0 * PI) - PI);
        totalEmissiveRadiance += uGlintColor * (uGlint * (exp(-glD * glD / 0.006) * 1.5 + exp(-glD * glD / 0.07) * 0.32));`,
      )
  }
  sides.customProgramCacheKey = () => 'frost-process-pane-sides'

  const mesh = new THREE.Mesh(geo, [caps, sides])
  return { mesh, caps, sides, u, su }
}

// ------------------------------------------------------------------ stencil (resist film)

export interface Film {
  mesh: THREE.Mesh
  mat: THREE.MeshStandardMaterial
  /** 0 = the film is whole (uncut), 1 = the pattern is cut out of it */
  u: { uCut: { value: number } }
}

/**
 * One piece of the resist film: `keep` +1 keeps the pattern (the resist that
 * stays on), −1 keeps the field (the sheet weeded away after the cut).
 */
export function makeFilm(sdf: PatternSdf, keep: 1 | -1, margin: number): Film {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#0b0c0e'),
    roughness: 0.34,
    metalness: 0,
    envMapIntensity: 0.9,
    transparent: true,
    side: THREE.DoubleSide,
  })
  const fu = {
    uSdf: { value: sdf.tex },
    uSdfScale: { value: sdf.scale * keep },
    uRect: { value: new THREE.Vector4(-PANE.w / 2, -PANE.h / 2, PANE.w, PANE.h) },
    uCut: { value: 1 },
  }
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, fu)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uRect;\nvarying vec2 vPUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPUv = (position.xy - uRect.xy) / uRect.zw;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uSdf;\nuniform float uSdfScale, uCut;\nvarying vec2 vPUv;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float fmSd = (texture2D(uSdf, vPUv).r - 0.5) * uSdfScale;
        float fmAa = max(fwidth(fmSd), 1e-5);
        diffuseColor.a *= mix(1.0, smoothstep(-fmAa, fmAa, fmSd), uCut);`,
      )
  }
  // both pieces share one program (the side kept is a uniform sign)
  mat.customProgramCacheKey = () => 'frost-process-film'
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PANE.w - 2 * margin, PANE.h - 2 * margin), mat)
  mesh.renderOrder = keep > 0 ? 2 : 3
  return { mesh, mat, u: { uCut: fu.uCut } }
}

// ------------------------------------------------------------------ kerf (the cut, drawn in light)

export interface Kerf {
  mesh: THREE.Mesh
  u: { uKerf: { value: number }; uGantry: { value: number }; uGantryY: { value: number }; uEdge: { value: number } }
}

export function makeKerf(sdf: PatternSdf, margin: number): Kerf {
  const u = {
    uSdf: { value: sdf.tex },
    uSdfScale: { value: sdf.scale },
    uRect: { value: new THREE.Vector4(-PANE.w / 2, -PANE.h / 2, PANE.w, PANE.h) },
    uKerf: { value: 0 },
    uGantry: { value: 0 },
    uGantryY: { value: 1.2 },
    uEdge: { value: (PANE.h - 2 * margin) / PANE.h },
    uColor: { value: new THREE.Color('#f2f6ff') },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform vec4 uRect;
      varying vec2 vPUv;
      void main() {
        vPUv = (position.xy - uRect.xy) / uRect.zw;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uSdf;
      uniform float uSdfScale, uKerf, uGantry, uGantryY;
      uniform vec3 uColor;
      varying vec2 vPUv;
      float sq(float x) { return x * x; }
      void main() {
        float sd = (texture2D(uSdf, vPUv).r - 0.5) * uSdfScale;
        float aa = max(fwidth(sd), 1e-5);
        // a razor line of light along the cut, and a faint bleed beside it
        float line = exp(-sq(sd / aa) / 1.1);
        float bleed = exp(-abs(sd) / 0.005) * 0.07;
        float ay = max(fwidth(vPUv.y), 1e-5);
        float dy = vPUv.y - uGantryY;
        float done = smoothstep(-ay, ay, dy);                 // above the gantry: cut
        float head = exp(-sq(dy / (ay * 5.0)));               // where the gantry crosses the kerf
        float k = (line + bleed) * (done + head * 2.2) * uKerf;
        float gantry = exp(-sq(dy / (ay * 0.9))) * uGantry;   // the gantry: a hairline across the sheet
        gl_FragColor = vec4(uColor * (k * 1.05 + gantry * 0.8), 1.0);
      }
    `,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PANE.w - 2 * margin, PANE.h - 2 * margin), mat)
  mesh.renderOrder = 4
  return { mesh, u }
}

// ------------------------------------------------------------------ block (station 1)

export interface Block {
  root: THREE.Group
  mesh: THREE.Mesh
  mat: THREE.MeshPhysicalMaterial
  ring: THREE.Mesh
  ringMat: THREE.MeshBasicMaterial
  haze: THREE.Mesh
  hazeMat: THREE.MeshBasicMaterial
}

export function makeBlock(mobile: boolean): Block {
  const root = new THREE.Group()
  const geo = smoothExtrude(roundedRect(BLOCK.w, BLOCK.h, BLOCK.radius), {
    depth: BLOCK.d,
    bevel: BLOCK.bevel,
    bevelSegments: mobile ? 4 : 7,
    curveSegments: 10,
    crease: Math.PI / 4.5,
  })
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.0,
    transmission: 1,
    thickness: 1.5,
    ior: 1.52,
    specularIntensity: 1,
    envMapIntensity: 1.25,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    attenuationColor: new THREE.Color('#e9f1f7'),
    attenuationDistance: 5,
  })
  mat.dispersion = mobile ? 0 : 0.4
  sharpTransmission(mat)
  const mesh = new THREE.Mesh(geo, mat)
  root.add(mesh)

  // the inspection ring: hugs the block's horizontal cross-section
  const bs = BLOCK.bevel * 0.85
  const ow = BLOCK.w + 2 * bs + 0.014
  const od = BLOCK.d + 2 * BLOCK.bevel + 0.014
  const lw = 0.011
  const outer = roundedRect(ow, od, BLOCK.bevel * 0.9)
  outer.holes.push(roundedRect(ow - 2 * lw, od - 2 * lw, BLOCK.bevel * 0.9 - lw * 0.5))
  const ringMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#f4f8ff').multiplyScalar(2.4),
    blending: THREE.AdditiveBlending,
    transparent: false,
    depthWrite: true,
    toneMapped: false,
    side: THREE.DoubleSide,
  })
  // a thin belt (not a flat ring): seen from near eye level it keeps its height, so it never dots out
  const ringGeo = new THREE.ExtrudeGeometry(outer, { depth: 0.011, bevelEnabled: false, curveSegments: 12 })
  ringGeo.translate(0, 0, -0.0055)
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.rotation.x = -Math.PI / 2
  root.add(ring)
  // the plane of the scan inside the glass: a faint sheet of light (opaque list → refracted)
  const hazeMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#dfe7f2').multiplyScalar(0.1),
    blending: THREE.AdditiveBlending,
    transparent: false,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  })
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK.w + 0.02, BLOCK.d + 0.1), hazeMat)
  haze.rotation.x = -Math.PI / 2
  root.add(haze)
  return { root, mesh, mat, ring, ringMat, haze, hazeMat }
}

// ------------------------------------------------------------------ light

/** A soft backlight (with one crisp slit) kept in the opaque list so glass in front diffuses/refracts it. */
export function makeLightCard(w: number, h: number): { mesh: THREE.Mesh; u: { uIntensity: { value: number }; uSlit: { value: number }; uSlitX: { value: number } } } {
  const u = {
    uIntensity: { value: 1 },
    uSlit: { value: 1 },
    uSlitX: { value: 0.22 },
    uColor: { value: new THREE.Color('#e8eef8') },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    transparent: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uIntensity, uSlit, uSlitX;
      uniform vec3 uColor;
      varying vec2 vUv;
      float sq(float x) { return x * x; }
      void main() {
        vec2 p = (vUv - 0.5) * vec2(${w.toFixed(3)}, ${h.toFixed(3)});
        float r2 = p.x * p.x * 1.15 + p.y * p.y * 0.8;
        float glow = exp(-r2 / 0.9) * 0.34 + exp(-r2 / 0.16) * 0.28;
        // a crisp slit of light, fading top and bottom
        float ax = max(fwidth(p.x), 1e-5);
        float slit = exp(-sq((p.x - uSlitX) / (ax * 1.3))) * exp(-sq(p.y / 1.2)) * uSlit;
        float edge = (1.0 - smoothstep(0.35, 0.5, abs(vUv.x - 0.5))) * (1.0 - smoothstep(0.35, 0.5, abs(vUv.y - 0.5)));
        gl_FragColor = vec4(uColor * ((glow * edge) + slit * 0.9) * uIntensity, 1.0);
      }
    `,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  return { mesh, u }
}

/** A light pool on the (invisible) floor. */
export function makePool(w: number, d: number): { mesh: THREE.Mesh; u: { uIntensity: { value: number } } } {
  const u = { uIntensity: { value: 1 }, uColor: { value: new THREE.Color('#e3eaf4') } }
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r2 = dot(p, p);
        float pool = exp(-r2 * 3.2) * 0.5 + exp(-r2 * 14.0) * 0.35;
        gl_FragColor = vec4(uColor * pool * uIntensity, 1.0);
      }
    `,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat)
  mesh.rotation.x = -Math.PI / 2
  return { mesh, u }
}

/** The spotlight's shaft: a faint additive cone (apex up). */
export function makeShaft(radius: number, height: number): { mesh: THREE.Mesh; u: { uIntensity: { value: number } } } {
  const u = { uIntensity: { value: 1 }, uH: { value: height } }
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uH;
      varying float vY;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vY = position.y / uH + 0.5;             // 0 at the base (the block) … 1 at the lamp
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      varying float vY;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = abs(dot(normalize(vN), normalize(vV)));
        float body = f * f;
        float fall = smoothstep(0.0, 0.25, vY) * (1.0 - smoothstep(0.55, 1.0, vY));
        gl_FragColor = vec4(vec3(0.9, 0.93, 1.0) * body * fall * 0.07 * uIntensity, 1.0);
      }
    `,
  })
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 48, 1, true), mat)
  mesh.renderOrder = 1
  return { mesh, u }
}

// ------------------------------------------------------------------ nozzle + spray

export function makeNozzle(): THREE.Mesh {
  const pts = [
    [0.0, 0.0],
    [0.014, 0.0],
    [0.02, 0.012],
    [0.028, 0.06],
    [0.04, 0.13],
    [0.042, 0.16],
    [0.042, 0.56],
    [0.05, 0.57],
    [0.05, 0.64],
    [0.034, 0.66],
    [0.034, 0.9],
  ].map(([r, y]) => new THREE.Vector2(r, y))
  const geo = new THREE.LatheGeometry(pts, 40)
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#b9bfc8'), metalness: 1, roughness: 0.14, envMapIntensity: 1.3 })
  return new THREE.Mesh(geo, mat)
}

export interface Spray {
  points: THREE.Points
  u: {
    uFrom: { value: THREE.Vector3 }
    uTo: { value: THREE.Vector3 }
    uTime: { value: number }
    uIntensity: { value: number }
    uSize: { value: number }
    uSpread: { value: number }
  }
}

export function makeSpray(count: number): Spray {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  const seeds = new Float32Array(count * 4)
  let a = 1234567
  const r = () => {
    a = (a * 16807) % 2147483647
    return (a - 1) / 2147483646
  }
  for (let i = 0; i < count * 4; i++) seeds[i] = r()
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50)
  const u = {
    uFrom: { value: new THREE.Vector3() },
    uTo: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uIntensity: { value: 0 },
    uSize: { value: 2 },
    uSpread: { value: 0.12 },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform vec3 uFrom, uTo;
      uniform float uTime, uIntensity, uSize, uSpread;
      varying float vA;
      void main() {
        float speed = 1.3 + aSeed.y * 1.1;
        float life = fract(aSeed.x + uTime * speed);
        vec3 dir = uTo - uFrom;
        vec3 nd = normalize(dir);
        vec3 up = abs(nd.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
        vec3 s1 = normalize(cross(nd, up));
        vec3 s2 = cross(nd, s1);
        float ang = aSeed.z * 6.2831853;
        vec3 p;
        float a;
        if (aSeed.w < 0.74) {
          // the stream: a fine cone widening toward the glass
          float rr = sqrt(fract(aSeed.w * 7.13)) * uSpread * (0.12 + life * life);
          p = uFrom + dir * life + (s1 * cos(ang) + s2 * sin(ang)) * rr;
          a = smoothstep(0.0, 0.1, life) * (0.12 + 0.28 * life);
        } else {
          // ricochet: grains bounce off the glass in a low fan and fall
          float sp = 0.18 + 0.5 * fract(aSeed.w * 13.7);
          vec3 o = vec3(cos(ang), sin(ang) * 0.8, 0.0) * sp + vec3(0.0, 0.0, 0.12 + 0.3 * fract(aSeed.y * 5.3));
          p = uTo + o * life * 0.9 + vec3(0.0, -0.45, 0.0) * life * life;
          a = (1.0 - life) * (1.0 - life) * 0.9;
        }
        vA = a * uIntensity;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (0.55 + 0.9 * fract(aSeed.x * 17.31));
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float m = 1.0 - smoothstep(0.06, 0.25, dot(c, c));
        gl_FragColor = vec4(vec3(0.93, 0.95, 1.0) * vA * m * 2.1, 1.0);
      }
    `,
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  points.renderOrder = 4
  return { points, u }
}

/** The bright point where the stream strikes the glass. */
export function makeImpact(): { mesh: THREE.Mesh; u: { uIntensity: { value: number } } } {
  const u = { uIntensity: { value: 0 } }
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r2 = dot(p, p);
        float g = exp(-r2 * 42.0) * 0.9 + exp(-r2 * 6.0) * 0.12;
        gl_FragColor = vec4(vec3(0.95, 0.97, 1.0) * g * uIntensity, 1.0);
      }
    `,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), mat)
  mesh.renderOrder = 4
  return { mesh, u }
}
