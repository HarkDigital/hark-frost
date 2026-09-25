import * as THREE from 'three'
import { G, edgeGlow, frostedLogo, type FrostedLogo, flattenCaps, smoothSides } from '../../kit/glass'
import { rng } from '../../core/math'

/*
 * FROST — the hero set. A black gallery with one object in it.
 *
 *   the mark       kit frostedLogo(): sandblasted caps, a deep POLISHED bevel.
 *                  The caps carry a sandblast grain (a tiled normal map that
 *                  also speckles the transmitted light: it reads in the macro
 *                  shots and mip-averages away in the wide ones) and a moving
 *                  THAW window — a clear, crisp spot with a crystalline melt
 *                  front, injected into the roughness (uniforms only, one
 *                  program, never recompiled). A faint fresnel rim (same
 *                  geometry, additive) lights the silhouette from within.
 *   the backlight  a camera-facing light card behind the mark. It renders
 *                  BRIGHT into three's transmission buffer (what the frosted
 *                  glass sees and diffuses: a broad light box, a hot core,
 *                  the two slits with soft shoulders, and in the thaw beat a
 *                  light strip straight behind the thaw path) and only
 *                  faintly in the frame itself (hairline slits), so the
 *                  sandblasted faces glow luminous white-grey like a backlit
 *                  sign while the room stays black. (The card can draw
 *                  hairline rings, CardPass.rings, but they stay off:
 *                  polished bevels bend them into dashes.)
 *   the floor      black, additive: a soft pool where the backlight spills,
 *                  so the world's halo reads as reflected in a black mirror.
 *   the reflection a flipped copy of the mark under the floor (cheap shader,
 *                  not transmissive): a frosted glow + bevel rims, fading
 *                  with depth.
 */

/** mark height in world units */
export const MARK_S = 2.2
/** the black mirror floor, a little below the mark */
export const FLOOR_Y = -MARK_S / 2 - 0.36
/** the mark's extrusion (mark units): the front cap sits at z = DEPTH / 2 + BEVEL */
const DEPTH = 0.2
const BEVEL = 0.026
export const FRONT_Z = DEPTH / 2 + BEVEL
/**
 * the thaw window's path across the front cap (mark units): down the centre of
 * the lower-right band (0.098 wide), from the right loop toward the bottom one
 */
export const THAW_A = new THREE.Vector3(0.258, 0.052, FRONT_Z)
export const THAW_B = new THREE.Vector3(-0.042, -0.248, FRONT_Z)

export interface HeroSet {
  /** turntable pivot at the mark's centre (the mark is centred on the origin) */
  pivot: THREE.Group
  logo: FrostedLogo
  caps: THREE.MeshPhysicalMaterial
  sides: THREE.MeshPhysicalMaterial
  /**
   * caps shader uniforms: uThaw (x, y in mark units, open 0..1), uThawR (mark
   * units), uGrain (how much the sandblast speckles the light), uFront (the
   * thaw's crystalline rim)
   */
  capsU: CapsUniforms
  /** fresnel rim on the silhouette (additive, same geometry) */
  rim: THREE.ShaderMaterial
  card: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  /** strengths the card uses in the frame vs in the glass buffer */
  cardK: { main: CardPass; trans: CardPass }
  floor: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  reflection: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
  /** the mark's width / height */
  markAspect: number
}

export interface CapsUniforms {
  uThaw: { value: THREE.Vector3 }
  uThawR: { value: number }
  uGrain: { value: number }
  uFront: { value: number }
}

/**
 * Sandblast grain: a tiny tiling normal map. Height = white noise blurred to
 * ~2 texel grains; normals from its gradient. Linear, mipmapped.
 */
function grainTexture(size = 256): THREE.DataTexture {
  const rand = rng(11)
  const h = new Float32Array(size * size)
  for (let i = 0; i < h.length; i++) h[i] = rand()
  // two box-blur passes (wrapping) → soft, rounded grains
  const tmp = new Float32Array(size * size)
  const idx = (x: number, y: number) => ((y + size) % size) * size + ((x + size) % size)
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) tmp[idx(x, y)] = (h[idx(x - 1, y)] + h[idx(x, y)] + h[idx(x + 1, y)]) / 3
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) h[idx(x, y)] = (tmp[idx(x, y - 1)] + tmp[idx(x, y)] + tmp[idx(x, y + 1)]) / 3
  }
  const data = new Uint8Array(size * size * 4)
  const k = 6
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h[idx(x + 1, y)] - h[idx(x - 1, y)]) * k
      const dy = (h[idx(x, y + 1)] - h[idx(x, y - 1)]) * k
      const inv = 1 / Math.hypot(dx, dy, 1)
      const o = (y * size + x) * 4
      data[o] = Math.round((-dx * inv * 0.5 + 0.5) * 255)
      data[o + 1] = Math.round((-dy * inv * 0.5 + 0.5) * 255)
      data[o + 2] = Math.round((inv * 0.5 + 0.5) * 255)
      data[o + 3] = 255
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 4
  tex.colorSpace = THREE.NoColorSpace
  tex.needsUpdate = true
  return tex
}

/** Clean normals for close-ups (smooth bevels, flat caps). ~20–60 ms: run it after a yield. */
export function refineMark(geo: THREE.BufferGeometry) {
  // the kit's frostedLogo already refines its normals; kept for callers
  smoothSides(geo)
  flattenCaps(geo)
}

const LOD_RE = /float lod = log2\( transmissionSamplerSize\.x \) \* applyIorToRoughness\( roughness, ior \);\s*return textureBicubic\( transmissionSamplerMap, fragCoord\.xy, lod \);/

/**
 * three's transmission read, but CRISP where the glass is clear: three blurs
 * even polished glass a little (bicubic at its minimum roughness), so the thaw
 * window reads mip 0, blending to three's own soft read as the frost returns.
 */
function crispTransmissionChunk(): string | null {
  const chunk = THREE.ShaderChunk.transmission_pars_fragment
  if (!LOD_RE.test(chunk)) {
    if (import.meta.env.DEV) console.warn('[hero] three transmission chunk changed; the thaw window will blur')
    return null
  }
  return chunk.replace(
    LOD_RE,
    `float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		vec4 crispT = textureLod( transmissionSamplerMap, fragCoord.xy, 0.0 );
		vec4 softT = textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
		return mix( crispT, softT, smoothstep( 0.9, 1.8, lod ) );`,
  )
}

const CAPS_PARS = /* glsl */ `
varying vec3 vMarkP;
uniform vec3 uThaw;
uniform float uThawR, uGrain, uFront;
float heroHash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float heroNoise( vec2 p ) {
	vec2 i = floor( p ), f = fract( p );
	vec2 w = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( heroHash( i ), heroHash( i + vec2( 1.0, 0.0 ) ), w.x ), mix( heroHash( i + vec2( 0.0, 1.0 ) ), heroHash( i + vec2( 1.0, 1.0 ) ), w.x ), w.y ) - 0.5;
}`

const CAPS_THAW = /* glsl */ `#include <roughnessmap_fragment>
	float thawK = 0.0;
	float frostFront = 0.0;
	if ( uThaw.z > 0.0 ) {
		// a clear window gliding across the face; its melt front is a fine
		// crystalline edge, fixed in the glass as the window moves through it
		// (a uniform branch: the rest of the story skips the noise)
		float openK = uThaw.z * ( 2.0 - uThaw.z );
		float on = smoothstep( 0.0, 0.08, uThaw.z );
		float n = heroNoise( vMarkP.xy * 40.0 ) * 0.012 + heroNoise( vMarkP.xy * 130.0 ) * 0.0022;
		float e = length( vMarkP.xy - uThaw.xy ) - uThawR * openK + n;
		float aa = max( fwidth( e ), 1e-4 );
		thawK = ( 1.0 - smoothstep( -aa, aa, e ) ) * on;
		frostFront = ( smoothstep( -0.003 - aa, 0.0, e ) - smoothstep( 0.0, 0.0055 + aa, e ) ) * on;
	}
	roughnessFactor = mix( roughnessFactor, 0.0, thawK );`

const CAPS_GRAIN = /* glsl */ `#include <normal_fragment_maps>
	normal = normalize( mix( normal, nonPerturbedNormal, thawK ) );
	// the sandblast speckles the light it lets through (lit from the upper left);
	// mip-averaged to nothing when the grain is sub-pixel
	vec3 grainT = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	float grainL = dot( grainT.xy, vec2( -0.6, 0.8 ) ) * ( 1.0 - thawK );`

const CAPS_OUT = /* glsl */ `outgoingLight *= max( 1.0 + uGrain * grainL, 0.0 );
	outgoingLight += vec3( 0.93, 0.95, 1.0 ) * ( uFront * frostFront );
	#include <opaque_fragment>`

export function buildMark(mobile: boolean, envMap: THREE.Texture | null): Pick<HeroSet, 'pivot' | 'logo' | 'caps' | 'sides' | 'capsU' | 'rim' | 'markAspect'> {
  const logo = frostedLogo({ depth: DEPTH, bevel: BEVEL, frost: 0.46 })
  const { caps, sides } = logo
  // monochrome and razor sharp: no dispersion split on the polished edges
  sides.dispersion = 0
  sides.clearcoat = 1
  sides.clearcoatRoughness = 0.02
  // phones: the thinnest rim highlight is sub-pixel; a touch more roughness keeps it a line, not dots
  if (mobile) {
    sides.roughness = 0.045
    sides.clearcoatRoughness = 0.05
  }
  // a thin optical path through the bevels: they bend what's behind cleanly instead of scrambling it
  sides.thickness = 0.07
  // clear edges pass less light than the frost glows (much of it bends away): darker
  // polished walls under crisp highlights read as glass, and outline the mark sharply
  sides.color.setScalar(0.55)
  // own env maps, so caps (a sandblasted sheen) and bevels (crisp strips) are lit separately
  if (envMap) {
    caps.envMap = envMap
    sides.envMap = envMap
  }
  // (the chapter drives both intensities: dark before the reveal, lit after)
  caps.envMapIntensity = 0.1
  // a short optical path through the flat faces: the sandblast grain glints instead of
  // warping the light behind it into a hammered-glass ripple
  caps.thickness = 0.16
  sides.envMapIntensity = 0.35
  // the sandblast grain: coarse enough to read in the macro shots (a few device px per
  // grain there), fine enough to mip-average away when the whole mark is on screen
  const grain = grainTexture()
  grain.repeat.set(mobile ? 7 : 9, mobile ? 7 : 9)
  caps.normalMap = grain
  caps.normalScale.set(0.02, 0.02)
  // the thaw: a clear window that glides across the caps
  const capsU: CapsUniforms = {
    uThaw: { value: new THREE.Vector3(0, 0, 0) },
    uThawR: { value: 0.066 },
    uGrain: { value: 0 },
    uFront: { value: 0 },
  }
  const crisp = crispTransmissionChunk()
  caps.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, capsU)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMarkP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMarkP = position;')
    let f = sh.fragmentShader
    if (crisp) f = f.replace('#include <transmission_pars_fragment>', crisp)
    sh.fragmentShader = f
      .replace('#include <common>', `#include <common>\n${CAPS_PARS}`)
      .replace('#include <roughnessmap_fragment>', CAPS_THAW)
      .replace('#include <normal_fragment_maps>', CAPS_GRAIN)
      .replace('#include <opaque_fragment>', CAPS_OUT)
  }
  caps.customProgramCacheKey = () => 'hark-frost-hero-caps-2'

  // light caught inside the glass escapes at its silhouette: a faint fresnel rim
  const rim = edgeGlow(G.ice, 3, 0)
  const rimMesh = new THREE.Mesh(logo.mark.geometry, rim)
  rimMesh.renderOrder = 2
  logo.root.add(rimMesh)

  logo.root.scale.setScalar(MARK_S)
  const pivot = new THREE.Group()
  pivot.add(logo.root)
  const bb = logo.mark.geometry.boundingBox!
  const markAspect = (bb.max.x - bb.min.x) / Math.max(1e-3, bb.max.y - bb.min.y)
  return { pivot, logo, caps, sides, capsU, rim, markAspect }
}

const CARD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const CARD_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uHalf, uCore, uWideR, uSlitH, uBarW, uRings, uRingGap;
  uniform vec2 uHot, uSlitX, uSlitA;
  uniform vec3 uLine;
  // per pass (frame vs glass buffer)
  uniform float uGlow, uWide, uSlit, uSlitW, uBar, uLineK, uLineW, uRingsK;
  varying vec2 vUv;
  float g2(float x) { return exp(-x * x); }
  void main() {
    vec2 p = (vUv - 0.5) * 2.0 * uHalf;          // world units from the card centre
    float r = length(p);
    // a hot core right behind the mark (uHot: the light's own centre) + a faint skirt
    vec2 q = p - uHot;
    float C = max(uCore, 0.01);
    float glow = exp(-dot(q, q) / (C * C)) + 0.12 * exp(-r * r / (C * C * 6.0));
    // a broad light box behind the whole mark (glass buffer): every loop sits over light,
    // brightest at the heart, luminous grey out at the loop tips
    float W = max(uWideR, 0.01);
    float wide = exp(-dot(q, q) / (W * W));
    // two vertical light slits: hairlines in the room, bright lines with soft shoulders in
    // the glass buffer (frost diffuses them into glowing bars; the polished bevel bends them sharp)
    float fw = fwidth(p.x);
    float w = max(uSlitW, fw * 0.8);
    float sy = g2(p.y / uSlitH);
    float slit = (uSlitA.x * g2((p.x - uSlitX.x) / w) + uSlitA.y * g2((p.x - uSlitX.y) / w)) * sy;
    float bar = (uSlitA.x * g2((p.x - uSlitX.x) / uBarW) + uSlitA.y * g2((p.x - uSlitX.y) / uBarW)) * sy;
    // the thaw's light strip: a line straight behind the thaw path (razor sharp through the
    // clear window, a soft bar through the frost around it)
    float ld = dot(uLine.xy, p) + uLine.z;
    float lw = max(uLineW, fwidth(ld) * 0.8);
    float strip = g2(ld / lw) + 0.18 * g2(ld / uBarW);
    // hairline concentric rings (sound — Hark means listen), only ever seen through a thaw
    float rr = r / uRingGap;
    float d = abs(fract(rr + 0.5) - 0.5);
    float rw = max(fwidth(rr) * 1.25, 0.07);
    float ring = (1.0 - smoothstep(0.0, rw, d)) * smoothstep(0.02, 0.12, r) * exp(-r * r / (C * C * 5.0));
    float edge = 1.0 - smoothstep(0.7, 1.0, r / uHalf);
    vec3 col = uColor * (glow * uGlow + wide * uWide + slit * uSlit + bar * uBar + strip * uLineK + ring * uRings * uRingsK) * edge;
    gl_FragColor = vec4(col, 1.0);
  }
`

/** What the card draws in one pass. */
export interface CardPass {
  glow: number
  /** the broad light box (uWideR) */
  wide: number
  slit: number
  /** slit half-width (world); the frame's hairline is AA'd to ≥ ~1px */
  width: number
  /** the slits' soft shoulders (uBarW) */
  bar: number
  /** the thaw light strip (uLine) and its half-width */
  line: number
  lineWidth: number
  rings: number
}

/**
 * The backlight card. Opaque-list + additive (so three's transmission pass
 * captures it), with per-pass strengths: onBeforeRender tells the frame's
 * scene render from the glass buffer (anything else).
 */
export function buildCard(isFrameTarget: (rt: THREE.WebGLRenderTarget | null) => boolean): Pick<HeroSet, 'card' | 'cardK'> {
  const cardK = {
    main: { glow: 0, wide: 0, slit: 0, width: 0.004, bar: 0, line: 0, lineWidth: 0.004, rings: 0 } as CardPass,
    trans: { glow: 0, wide: 0, slit: 0, width: 0.03, bar: 0, line: 0, lineWidth: 0.004, rings: 0 } as CardPass,
  }
  const mat = new THREE.ShaderMaterial({
    transparent: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    uniforms: {
      uColor: { value: new THREE.Color(G.ice) },
      uHalf: { value: 5 },
      uCore: { value: 0.6 },
      uWideR: { value: 1.5 },
      uHot: { value: new THREE.Vector2() },
      uSlitX: { value: new THREE.Vector2(-0.6, 0.5) },
      uSlitA: { value: new THREE.Vector2(1, 0.7) },
      uSlitH: { value: 3 },
      uBarW: { value: 0.1 },
      uLine: { value: new THREE.Vector3(1, 0, 100) },
      uRings: { value: 0 },
      uRingGap: { value: 0.12 },
      uGlow: { value: 0 },
      uWide: { value: 0 },
      uSlit: { value: 0 },
      uSlitW: { value: 0.01 },
      uBar: { value: 0 },
      uLineK: { value: 0 },
      uLineW: { value: 0.004 },
      uRingsK: { value: 0 },
    },
    vertexShader: CARD_VERT,
    fragmentShader: CARD_FRAG,
  })
  const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
  card.renderOrder = -6
  card.frustumCulled = false
  const u = mat.uniforms
  card.onBeforeRender = renderer => {
    const rt = renderer.getRenderTarget()
    const k = rt === null || isFrameTarget(rt as THREE.WebGLRenderTarget) ? cardK.main : cardK.trans
    u.uGlow.value = k.glow
    u.uWide.value = k.wide
    u.uSlit.value = k.slit
    u.uSlitW.value = k.width
    u.uBar.value = k.bar
    u.uLineK.value = k.line
    u.uLineW.value = k.lineWidth
    u.uRingsK.value = k.rings
    mat.uniformsNeedUpdate = true
  }
  return { card, cardK }
}

const FLOOR_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uK;
  uniform vec2 uPool, uPoolR;
  varying vec2 vUv;
  varying vec3 vW;
  void main() {
    vec2 d = (vW.xz - uPool) / uPoolR;
    float pool = exp(-dot(d, d));
    float edge = 1.0 - smoothstep(0.35, 0.5, length(vUv - 0.5));
    gl_FragColor = vec4(uColor * pool * edge * uK, 1.0);
  }
`

export function buildFloor(): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  const mat = new THREE.ShaderMaterial({
    transparent: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uColor: { value: new THREE.Color(G.ice) },
      uK: { value: 0 },
      uPool: { value: new THREE.Vector2(0, -0.8) },
      uPoolR: { value: new THREE.Vector2(1.05, 0.6) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vW;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: FLOOR_FRAG,
  })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), mat)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = FLOOR_Y
  floor.renderOrder = -7
  return floor
}

/**
 * The mark mirrored in the black floor: frosted glow toward the centre, a
 * bright rim on the bevels, fading with depth below the floor. Transparent +
 * additive, so the glass buffer never sees it.
 */
export function buildReflection(geo: THREE.BufferGeometry): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uColor: { value: new THREE.Color(G.ice) },
      uStrength: { value: 0 },
      uFloorY: { value: FLOOR_Y },
      uFade: { value: 1.6 },
      uRadius: { value: 0.32 },
      uRim: { value: 1.4 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vP; varying vec3 vN; varying vec3 vV; varying float vWY;
      void main() {
        vP = position;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWY = w.y;
        vec4 mv = viewMatrix * w;
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uStrength, uFloorY, uFade, uRadius, uRim;
      varying vec3 vP; varying vec3 vN; varying vec3 vV; varying float vWY;
      void main() {
        float below = max(uFloorY - vWY, 0.0);
        float fade = exp(-below * uFade) * step(vWY, uFloorY + 0.001);
        float glow = 0.22 + 0.78 * exp(-dot(vP.xy, vP.xy) / (uRadius * uRadius));
        float nv = clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0);
        float f = 1.0 - nv;
        float rim = f * f * f;
        vec3 col = uColor * (glow * nv * 0.75 + rim * uRim);
        gl_FragColor = vec4(col * fade * uStrength, 1.0);
      }
    `,
  })
  const m = new THREE.Mesh(geo, mat)
  m.matrixAutoUpdate = false
  m.frustumCulled = false
  m.renderOrder = 1
  return m
}

/** reflect about the floor plane: y → 2·FLOOR_Y − y */
export const FLOOR_MIRROR = new THREE.Matrix4().makeTranslation(0, 2 * FLOOR_Y, 0).multiply(new THREE.Matrix4().makeScale(1, -1, 1))
