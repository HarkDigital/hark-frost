import * as THREE from 'three'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import { extrudeInset, logoParts, logoShapes } from '../logo/logo'

/*
 * Hark Glass kit — one visual language for every chapter.
 *
 *   G                          palette by name (hex strings)
 *   glass(opts)                cached MeshPhysicalMaterial: real transmission,
 *                              thickness, IOR, dispersion (desktop), optional
 *                              frost (roughness), tint (attenuation), iridescence
 *   GLASS.clear / .frost / .tinted(color) / .ice / .smoke   presets
 *   crystal(color, strength)   a glowing crystal core (the mark's diamond; ice-white by default)
 *   glassLogo(opts)            the Hark mark as a thick, bevelled glass object:
 *                              two glass loops + a glowing crystal core. Smooth
 *                              (creased) normals so highlights run clean.
 *   pane(w, h, opts)           rounded glass slab (cards, displays, shields)
 *   smoothExtrude(shapes, o)   extrude + bevel + creased normals (any shape)
 *   etch(text, opts)           frosted/etched text or glyphs on a plane, to sit
 *                              on or inside glass
 *   edgeGlow(color, power)     fresnel rim material (additive) — an outline of
 *                              light for an object's silhouette
 *   caustic(opts)              soft additive light pool for "floors" under glass
 *
 * Rules that make glass read:
 *  - glass needs something behind it to bend: the world light field, a
 *    colourful plane, or text. Put glass in front of colour, not black.
 *  - reflections come from the studio environment (world.params.env /
 *    envTurn). Sweep envTurn to run a highlight across the glass.
 *  - keep glass objects few and big; three's transmission pass renders the
 *    opaque scene once per frame for all of them (glass does not see other
 *    glass — put opaque colour between layers if you need depth).
 *  - dispersion (rainbow edges) is desktop-only; phones get plain refraction.
 */

export const G = {
  /** Frost is monochrome on black: the brand is the monochrome mark */
  black: '#000000',
  ink: '#050506',
  night: '#0b0c0f',
  graphite: '#16181c',
  steel: '#5d636d',
  silver: '#c7ccd4',
  mist: '#dfe4ea',
  white: '#f6f7f9',
  /** a barely-cool white for backlight halos (never a colour accent) */
  ice: '#e6eeff',
  /**
   * the NEON pair: the only saturated light in the room. Glass tubes behind
   * frosted glass (the frost diffuses them into soft colour); never text,
   * never UI fills
   */
  neonA: '#3fd4ff',
  neonB: '#8f63ff',
  /** hostile tint, shield chapter only */
  ember: '#ff4d4d',
} as const

const mobile = typeof window !== 'undefined' && (matchMedia('(pointer: coarse)').matches || window.innerWidth < 768)

export interface GlassOpts {
  /** tint by absorption (colour deepens with thickness) */
  tint?: THREE.ColorRepresentation
  /** how far light travels before taking the full tint (world units) */
  tintDistance?: number
  /** 0 = clear, 0.2 = satin, 0.5 = frosted */
  frost?: number
  /** optical thickness for refraction (world units) */
  thickness?: number
  ior?: number
  /** rainbow edge split (desktop only) */
  dispersion?: number
  /** thin-film sheen 0..1 */
  iridescence?: number
  /** reflection strength multiplier */
  env?: number
  /** clearcoat for an extra sharp reflection layer */
  coat?: number
  /**
   * sample what's behind at full sharpness (three blurs transmission slightly
   * even at roughness 0): use for glass that must show a screenshot or text
   * crisply through it. Ignored when frost > 0.
   */
  sharp?: boolean
  side?: THREE.Side
}

const cache = new Map<string, THREE.MeshPhysicalMaterial>()

/** Cached physical glass. Same options → same material (share freely). */
export function glass(o: GlassOpts = {}): THREE.MeshPhysicalMaterial {
  const key = JSON.stringify(o)
  const hit = cache.get(key)
  if (hit) return hit
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: o.frost ?? 0.02,
    transmission: 1,
    thickness: o.thickness ?? 0.6,
    ior: o.ior ?? 1.5,
    specularIntensity: 1,
    specularColor: new THREE.Color(0xffffff),
    // NOTE: with scene.environment, three uses world.params.env
    // (scene.environmentIntensity) for every material that has no envMap of
    // its own — set material.envMap = ctx.world.envMap to make this count
    envMapIntensity: o.env ?? 1,
    clearcoat: o.coat ?? 0,
    clearcoatRoughness: 0.04,
    side: o.side ?? THREE.FrontSide,
  })
  m.dispersion = mobile ? 0 : (o.dispersion ?? 0.35)
  if (o.tint !== undefined) {
    m.attenuationColor = new THREE.Color(o.tint)
    m.attenuationDistance = o.tintDistance ?? 1.2
  }
  if (o.sharp && !o.frost) sharpTransmission(m)
  if (o.iridescence) {
    m.iridescence = o.iridescence
    m.iridescenceIOR = 1.3
    m.iridescenceThicknessRange = [120, 420]
  }
  cache.set(key, m)
  return m
}

const LOD_RE = /float lod = log2\( transmissionSamplerSize\.x \) \* applyIorToRoughness\( roughness, ior \);\s*return textureBicubic\( transmissionSamplerMap, fragCoord\.xy, lod \);/

/** Read the transmission buffer at mip 0 (no roughness blur) — crisp text/images through glass. */
export function sharpTransmission(m: THREE.MeshPhysicalMaterial) {
  const chunk = THREE.ShaderChunk.transmission_pars_fragment
  if (!LOD_RE.test(chunk)) {
    if (import.meta.env.DEV) console.warn('[hark] sharpTransmission: three transmission chunk changed; glass will blur')
    return
  }
  const sharp = chunk.replace(LOD_RE, 'return textureLod( transmissionSamplerMap, fragCoord.xy, 0.0 );')
  m.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <transmission_pars_fragment>', sharp)
  }
  m.customProgramCacheKey = () => 'glass-sharp-transmission'
}

export const GLASS = {
  /** clear and crisp: text / screenshots behind stay sharp */
  sharp: () => glass({ thickness: 0.5, dispersion: 0.2, sharp: true }),
  /** crystal-clear, thick, rainbow edges */
  clear: () => glass({ thickness: 0.9, dispersion: 0.4 }),
  /** satin frosted panel */
  frost: () => glass({ frost: 0.42, thickness: 0.3, dispersion: 0, env: 0.9 }),
  /** light frost: legible things behind, softened */
  satin: () => glass({ frost: 0.18, thickness: 0.4, dispersion: 0.15 }),
  /** faintly ice-blue, like thick float glass */
  ice: () => glass({ tint: '#d6e8ff', tintDistance: 2.4, thickness: 1.1, dispersion: 0.3 }),
  /** a coloured glass */
  tinted: (tint: THREE.ColorRepresentation, distance = 0.9) => glass({ tint, tintDistance: distance, thickness: 0.8, dispersion: 0.25 }),
  /** dark smoked glass */
  smoke: () => glass({ tint: '#3a4150', tintDistance: 0.6, thickness: 0.6, frost: 0.05, dispersion: 0.1 }),
  /** thin-film sheen on clear glass */
  opal: () => glass({ thickness: 0.7, dispersion: 0.3, iridescence: 0.8 }),
}

/** A glowing crystal: the mark's diamond, status lights. Ice-white by default (never brand green). */
export function crystal(color: THREE.ColorRepresentation = G.ice, strength = 2.2): THREE.MeshPhysicalMaterial {
  const key = `crystal:${new THREE.Color(color).getHexString()}:${strength}`
  const hit = cache.get(key)
  if (hit) return hit
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(color),
    emissiveIntensity: strength,
    metalness: 0,
    roughness: 0.08,
    transmission: 0.35,
    thickness: 0.3,
    ior: 1.6,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.2,
  })
  cache.set(key, m)
  return m
}

export interface ExtrudeOpts {
  depth?: number
  bevel?: number
  bevelSegments?: number
  curveSegments?: number
  /** normals smoothed across edges flatter than this (radians) */
  crease?: number
}

/** Extrude with a rounded bevel and creased (smooth) normals, centred in z. */
export function smoothExtrude(shapes: THREE.Shape | THREE.Shape[], o: ExtrudeOpts = {}): THREE.BufferGeometry {
  const depth = o.depth ?? 0.2
  const bevel = o.bevel ?? 0.03
  const g = new THREE.ExtrudeGeometry(shapes, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.85,
    bevelSegments: o.bevelSegments ?? (mobile ? 3 : 5),
    curveSegments: o.curveSegments ?? 24,
    steps: 1,
  })
  g.translate(0, 0, -depth / 2)
  const out = toCreasedNormals(g, o.crease ?? Math.PI / 5)
  g.dispose()
  out.computeBoundingBox()
  out.computeBoundingSphere()
  return out
}

export interface GlassLogo {
  root: THREE.Group
  loopA: THREE.Mesh
  loopB: THREE.Mesh
  core: THREE.Mesh
  /** a soft point light inside the core (ice glow cast on nearby glass) */
  glow: THREE.PointLight
}

/**
 * The Hark mark in glass: two thick glass loops and the diamond as a glowing
 * crystal core. 1 unit tall, centred, facing +z. Animate the parts freely.
 */
export function glassLogo(o: { depth?: number; material?: THREE.Material; coreStrength?: number; coreColor?: THREE.ColorRepresentation; light?: boolean } = {}): GlassLogo {
  const parts = logoParts()
  const depth = o.depth ?? 0.24
  const mat = o.material ?? GLASS.clear()
  const loopA = new THREE.Mesh(smoothExtrude(parts.loopA, { depth, bevel: 0.035 }), mat)
  const loopB = new THREE.Mesh(smoothExtrude(parts.loopB, { depth, bevel: 0.035 }), mat)
  const core = new THREE.Mesh(smoothExtrude(parts.diamond, { depth: depth * 0.9, bevel: 0.02, crease: 0.2 }), crystal(o.coreColor ?? G.ice, o.coreStrength ?? 2.2))
  const root = new THREE.Group()
  root.add(loopA, loopB, core)
  const glow = new THREE.PointLight(o.coreColor ?? G.ice, o.light === false ? 0 : 1.2, 2.2, 2)
  root.add(glow)
  return { root, loopA, loopB, core, glow }
}

/**
 * FROSTED glass (sandblasted): transmission with a high roughness, so what's
 * behind reads as a soft glow. On black it needs LIGHT behind it (the world's
 * halo, a light card) or it reads as a dark slab. `frost` 0.3 = satin …
 * 0.6 = heavy sandblast. Roughness is a uniform: animate it freely (thawing).
 */
export function frosted(o: { frost?: number; thickness?: number; tint?: THREE.ColorRepresentation; env?: number } = {}): THREE.MeshPhysicalMaterial {
  return glass({ frost: o.frost ?? 0.46, thickness: o.thickness ?? 0.7, dispersion: 0, tint: o.tint ?? '#eef3ff', tintDistance: 6, coat: 0, env: o.env ?? 1 })
}

/** POLISHED edges for frosted objects: crisp reflections, no dispersion (monochrome, razor sharp). */
export function polished(o: { thickness?: number } = {}): THREE.MeshPhysicalMaterial {
  return glass({ frost: 0.015, thickness: o.thickness ?? 0.07, dispersion: 0, coat: 1 })
}

export interface FrostedLogo {
  root: THREE.Group
  /** the mark (loops + diamond as one solid): caps frosted, bevels polished */
  mark: THREE.Mesh
  /** [frosted caps, polished sides] — animate caps.roughness to thaw */
  caps: THREE.MeshPhysicalMaterial
  sides: THREE.MeshPhysicalMaterial
}

/**
 * The Hark mark in FROSTED glass, razor sharp: high-resolution outline, a
 * deep polished bevel that catches crisp studio highlights along every edge,
 * sandblasted front and back faces that glow with whatever light is behind.
 * 1 unit tall, centred, facing +z. Use clone()d materials if you animate them.
 */
export function frostedLogo(
  o: { depth?: number; bevel?: number; frost?: number; shapes?: THREE.Shape[]; capThickness?: number; sideThickness?: number; refine?: boolean } = {},
): FrostedLogo {
  const shapes = o.shapes ?? logoShapes()
  const depth = o.depth ?? 0.16
  const bevel = o.bevel ?? 0.022
  // the bevel rolls INWARD from the true outline: its widest point is the
  // artwork's edge, so the curl channels and holes keep their drawn size
  // (an outward bevel closed the channels and made the loops read as rings)
  // (bevel 0: straight walls, sharp edges)
  const geo = extrudeInset(shapes, { depth, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: bevel > 0 ? (mobile ? 5 : 9) : 0 })
  // non-indexed (like ExtrudeGeometry): creased normals keep its material groups
  // (0 = front/back caps, 1 = sides + bevel)
  const g2 = toCreasedNormals(geo, Math.PI / 4.5)
  // clean normals for close-ups: smooth, consistent bevels (no zigzag
  // reflections) and exactly flat caps (no 'spoke' shading)
  if (o.refine !== false) {
    smoothSides(g2)
    flattenCaps(g2)
  }
  g2.computeBoundingBox()
  g2.computeBoundingSphere()
  // short optical paths: thin bevels and flat caps must not scramble what's behind
  const caps = frosted({ frost: o.frost ?? 0.46, thickness: o.capThickness ?? 0.16 }).clone()
  const sides = polished({ thickness: o.sideThickness ?? 0.07 }).clone()
  const mark = new THREE.Mesh(g2, [caps, sides])
  const root = new THREE.Group()
  root.add(mark)
  return { root, mark, caps, sides }
}

/**
 * The kit's creased normals average each cap triangle's outline vertices with
 * the first bevel facet, which fans soft 'spokes' of shading across the flat
 * faces. Caps (group 0) are exactly flat: set their normals to ±z.
 */
export function flattenCaps(geo: THREE.BufferGeometry) {
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  if (!nrm || !pos || geo.index) return
  // one cap group per shape (loops, diamond)
  for (const g of geo.groups) {
    if (g.materialIndex !== 0) continue
    for (let i = g.start; i < g.start + g.count; i++) nrm.setXYZ(i, 0, 0, pos.getZ(i) >= 0 ? 1 : -1)
  }
  nrm.needsUpdate = true
}

/**
 * Consistent smooth normals for the bevel + sides (group 1). The kit's creased
 * normals average each triangle's neighbours relative to its OWN normal, so
 * the two triangles of a bevel quad disagree at shared corners and the strip
 * reflections zigzag along every edge in close-up. Here every side corner at
 * the same position gets the same area-weighted normal, unless the face turns
 * away from it by more than `crease` (a real corner stays sharp).
 */
export function smoothSides(geo: THREE.BufferGeometry, crease = THREE.MathUtils.degToRad(32)) {
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  if (!nrm || !pos || geo.index) return
  const cosC = Math.cos(crease)
  const ids = new Int32Array(pos.count).fill(-1)
  const face = new Float32Array(pos.count * 3)
  const acc: number[] = []
  const map = new Map<string, number>()
  const q = (v: number) => Math.round(v * 2e5)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  for (const g of geo.groups) {
    if (g.materialIndex !== 1) continue
    for (let i = g.start; i + 2 < g.start + g.count; i += 3) {
      a.fromBufferAttribute(pos, i)
      b.fromBufferAttribute(pos, i + 1)
      c.fromBufferAttribute(pos, i + 2)
      c.sub(a)
      b.sub(a)
      b.cross(c) // area-weighted face normal
      const len = b.length() || 1
      for (let k = 0; k < 3; k++) {
        const v = i + k
        const key = `${q(pos.getX(v))},${q(pos.getY(v))},${q(pos.getZ(v))}`
        let id = map.get(key)
        if (id === undefined) {
          id = acc.length / 3
          map.set(key, id)
          acc.push(0, 0, 0)
        }
        ids[v] = id
        acc[id * 3] += b.x
        acc[id * 3 + 1] += b.y
        acc[id * 3 + 2] += b.z
        face[v * 3] = b.x / len
        face[v * 3 + 1] = b.y / len
        face[v * 3 + 2] = b.z / len
      }
    }
  }
  for (let v = 0; v < pos.count; v++) {
    const id = ids[v]
    if (id < 0) continue
    a.set(acc[id * 3], acc[id * 3 + 1], acc[id * 3 + 2]).normalize()
    b.set(face[v * 3], face[v * 3 + 1], face[v * 3 + 2])
    if (a.dot(b) >= cosC) nrm.setXYZ(v, a.x, a.y, a.z)
    else nrm.setXYZ(v, b.x, b.y, b.z)
  }
  nrm.needsUpdate = true
}

/** Rounded-rectangle glass slab, w x h, centred, facing +z. */
export function pane(
  w: number,
  h: number,
  o: { radius?: number; depth?: number; bevel?: number; material?: THREE.Material } = {},
): THREE.Mesh {
  const r = Math.min(o.radius ?? Math.min(w, h) * 0.08, w / 2, h / 2)
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
  const bevel = o.bevel ?? Math.min(0.04, (o.depth ?? 0.08) * 0.45)
  return new THREE.Mesh(smoothExtrude(s, { depth: o.depth ?? 0.08, bevel, curveSegments: 10 }), o.material ?? GLASS.clear())
}

/**
 * Etched / frosted text on a plane (canvas texture). Put it just inside or
 * behind a glass face; `glow` > 1 makes it an emissive light line that blooms.
 * Returns a mesh `height` world units tall, width from the text.
 */
export function etch(
  text: string,
  o: { height?: number; font?: string; weight?: number; color?: THREE.ColorRepresentation; glow?: number; opacity?: number; letterSpacing?: number } = {},
): THREE.Mesh {
  const px = 128
  const font = `${o.weight ?? 500} ${px}px ${o.font ?? "'Sora Variable', 'Sora', system-ui, sans-serif"}`
  const cv = document.createElement('canvas')
  const g = cv.getContext('2d')!
  g.font = font
  const ls = (o.letterSpacing ?? 0) * px
  const w = Math.ceil(g.measureText(text).width + ls * Math.max(0, text.length - 1)) + 16
  const h = Math.ceil(px * 1.3)
  cv.width = w
  cv.height = h
  const draw = () => {
    g.clearRect(0, 0, w, h)
    g.font = font
    g.textBaseline = 'middle'
    g.fillStyle = '#ffffff'
    if (ls) {
      let cx = 8
      for (const ch of text) {
        g.fillText(ch, cx, h / 2)
        cx += g.measureText(ch).width + ls
      }
    } else g.fillText(text, 8, h / 2)
  }
  draw()
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  document.fonts?.ready.then(() => {
    draw()
    tex.needsUpdate = true
  })
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    color: new THREE.Color(o.color ?? G.white).multiplyScalar(o.glow ?? 1),
    transparent: true,
    opacity: o.opacity ?? 0.85,
    depthWrite: false,
    toneMapped: (o.glow ?? 1) <= 1,
  })
  const height = o.height ?? 0.2
  return new THREE.Mesh(new THREE.PlaneGeometry((height * w) / h, height), mat)
}

/** Fresnel rim: add as a slightly larger / same-geometry mesh for a light outline. */
export function edgeGlow(color: THREE.ColorRepresentation = G.ice, power = 2.5, strength = 1.2): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uPower: { value: power }, uStrength: { value: strength } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uPower, uStrength;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float r = f * f * f;                 // no pow() on a possibly-negative base
        r = mix(r, f * f * f * f, clamp(uPower - 3.0, 0.0, 1.0));
        gl_FragColor = vec4(uColor * r * uStrength, 1.0);
      }
    `,
  })
}

/** Soft additive light pool (a caustic-like glow on a floor or wall plane). */
export function caustic(o: { size?: number; color?: THREE.ColorRepresentation; strength?: number } = {}): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: { uColor: { value: new THREE.Color(o.color ?? G.ice) }, uStrength: { value: o.strength ?? 0.8 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uStrength, uTime; varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p) * 2.0;
        float pool = exp(-r * r * 3.0);
        float ripple = 0.75 + 0.25 * sin(r * 22.0 - uTime * 1.5) * sin(atan(p.y, p.x + 1e-4) * 5.0 + uTime * 0.7);
        gl_FragColor = vec4(uColor * pool * ripple * uStrength, 1.0);
      }
    `,
  })
  const m = new THREE.Mesh(new THREE.PlaneGeometry(o.size ?? 3, o.size ?? 3), mat)
  m.rotation.x = -Math.PI / 2
  return m
}

/** What a neon tube draws in one pass (the frame, or three's glass buffer). */
export interface NeonPass {
  /** the tube itself: a white-hot gas core with saturated flanks */
  tube: number
  /** the tight halo hugging the tube */
  glow: number
  /** the wide coloured spill (frosted glass in front diffuses it) */
  spill: number
}

export interface NeonTube {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  /** per-pass strengths; `main` = the frame, `trans` = the glass buffer frosted glass reads */
  k: { main: NeonPass; trans: NeonPass }
  /** 0..1 ignition (multiplies every pass) */
  on: { value: number }
  /**
   * a copy for a black mirror floor: place it at the tube's mirror image
   * (y → 2·floorY − y; a straight tube needs no flip). It draws only below
   * `floorY`, fading with depth.
   */
  reflection(floorY: number, strength?: number, fade?: number): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
}

const NEON_VERT = /* glsl */ `
  uniform float uLen, uWidth;
  varying vec2 vP;
  varying float vWY;
  void main() {
    // a ribbon along the tube's axis, turned to face the camera (a round tube looks the same
    // from every side): x across in world units from the axis, y along from the centre
    vec3 axis = normalize((modelMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float along = position.y * (uLen + 2.0 * uWidth);
    vec3 p = c + axis * along;
    vec3 side = normalize(cross(axis, cameraPosition - p));
    float across = position.x * 2.0 * uWidth;
    vec3 w = p + side * across;
    vP = vec2(across, along);
    vWY = w.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  }
`
const NEON_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uLen, uR, uGlowR, uSpillR, uTube, uGlow, uSpill, uOn, uFloorY, uMirror, uFade;
  varying vec2 vP;
  varying float vWY;
  void main() {
    float halfL = uLen * 0.5;
    float dy = max(abs(vP.y) - halfL, 0.0);
    float d = length(vec2(vP.x, dy));
    // the tube: a round glass tube full of glowing gas, white-hot along the middle and
    // saturated toward its walls; anti-aliased to at least ~1.5 px so a far tube stays a line
    // (one pixel from the ribbon's own coordinates: a derivative of the capsule
    // distance breaks along the quad's diagonal)
    float aa = max(length(fwidth(vP)) * 0.75, 1e-5);
    float r = max(uR, aa * 0.75);
    float body = 1.0 - smoothstep(r - aa, r + aa, d);
    float x = clamp(d / r, 0.0, 1.0);
    vec3 gas = mix(vec3(1.0), uColor, smoothstep(0.05, 0.9, x)) * (1.0 - 0.45 * x * x);
    // the last stretch of each end is the electrode: the gas glow thins out
    float lit = smoothstep(halfL, halfL - 0.07, abs(vP.y));
    float halo = exp(-d * d / (uGlowR * uGlowR));
    float spill = exp(-d * d / (uSpillR * uSpillR));
    vec3 col = gas * body * (0.25 + 0.75 * lit) * uTube + uColor * (halo * uGlow + spill * uSpill) * mix(0.5, 1.0, lit);
    // mirrored copy: only below the floor, fading with depth
    float below = max(uFloorY - vWY, 0.0);
    col *= mix(1.0, exp(-below * uFade) * step(vWY, uFloorY + 0.001), uMirror);
    gl_FragColor = vec4(col * uOn, 1.0);
  }
`

/**
 * A straight NEON tube: a camera-facing ribbon along a vertical axis that
 * draws the glowing tube, a tight halo and a wide coloured spill in one
 * additive pass. It sits in the opaque list, so three's glass buffer sees it
 * and frosted glass in front diffuses it into soft colour; `k.trans` sets how
 * much light the glass gets, `k.main` what the room shows (tell the two apart
 * with `isFrameTarget`, e.g. ctx.post.isFrameTarget). Values are HDR: a tube
 * above the bloom threshold blooms. Position/rotate `mesh` (its local +y is
 * the tube axis); don't scale it.
 */
export function neonTube(o: {
  color: THREE.ColorRepresentation
  length: number
  radius?: number
  glowRadius?: number
  spillRadius?: number
  isFrameTarget: (rt: THREE.WebGLRenderTarget | null) => boolean
}): NeonTube {
  const glowR = o.glowRadius ?? 0.09
  const spillR = o.spillRadius ?? 0.45
  const on = { value: 1 }
  const uniforms = {
    uColor: { value: new THREE.Color(o.color) },
    uLen: { value: o.length },
    uWidth: { value: spillR * 2.6 },
    uR: { value: o.radius ?? 0.018 },
    uGlowR: { value: glowR },
    uSpillR: { value: spillR },
    uTube: { value: 0 },
    uGlow: { value: 0 },
    uSpill: { value: 0 },
    uOn: on,
    uFloorY: { value: -1e4 },
    uMirror: { value: 0 },
    uFade: { value: 1 },
  }
  const k = {
    main: { tube: 3, glow: 0.3, spill: 0.04 } as NeonPass,
    trans: { tube: 3, glow: 0.6, spill: 0.3 } as NeonPass,
  }
  const make = (u: typeof uniforms) => {
    const mat = new THREE.ShaderMaterial({
      transparent: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      uniforms: u,
      vertexShader: NEON_VERT,
      fragmentShader: NEON_FRAG,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
    mesh.frustumCulled = false
    mesh.renderOrder = -5
    return mesh
  }
  const mesh = make(uniforms)
  const bind = (m: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>, scale = 1) => {
    const u = m.material.uniforms
    m.onBeforeRender = renderer => {
      const rt = renderer.getRenderTarget()
      const p = rt === null || o.isFrameTarget(rt as THREE.WebGLRenderTarget) ? k.main : k.trans
      u.uTube.value = p.tube * scale
      u.uGlow.value = p.glow * scale
      u.uSpill.value = p.spill * scale
      m.material.uniformsNeedUpdate = true
    }
  }
  bind(mesh)
  return {
    mesh,
    k,
    on,
    reflection(floorY, strength = 0.35, fade = 1.4) {
      // same uniforms (shared ignition, colour, size), its own per-pass strengths and mirror
      const u = { ...uniforms, uTube: { value: 0 }, uGlow: { value: 0 }, uSpill: { value: 0 }, uFloorY: { value: floorY }, uMirror: { value: 1 }, uFade: { value: fade } }
      const m = make(u)
      m.renderOrder = -4
      bind(m, strength)
      return m
    },
  }
}
