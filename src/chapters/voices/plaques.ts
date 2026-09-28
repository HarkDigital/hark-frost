import * as THREE from 'three'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { G, flattenCaps, smoothSides } from '../../kit/glass'

/*
 * EDGE-LIT PLAQUES — a row of thick, clear glass plaques standing on slim
 * dark bases over the black mirror floor (y = 0). One per client.
 *
 * Cheap and honest (no transmission: glass doesn't see other glass, and the
 * room is black anyway):
 *
 *   body     the slab. Clear glass on black is almost invisible: its material
 *            is additive specular only (black diffuse, the studio strips in
 *            the polished faces and bevels), so it never darkens what's
 *            behind it and its edges catch crisp highlights.
 *   edge     the same slab's sides, additive: light injected at the base runs
 *            up the glass and leaks out of its polished edges — a bright line
 *            along the top edge, the side edges glowing near the base.
 *   etch     a plane just inside the back face carrying the engraving (RG
 *            mask: the quote, the credit): the sandblasted strokes catch the
 *            edge light and GLOW,
 *            brightest near the base and falling off upward, ice-white with a
 *            faint neon tint low down. `lit` ignites it; `front` is the light
 *            climbing the glass from the base.
 *   strip    the LED slot on the base's top face, HDR neon (bloom softens it).
 *   mirror   flipped copies of etch + edge under the floor, fading with depth,
 *            and a black mirrored base so they're occluded like the real one.
 *   floor    additive, black: a faint pool where each plaque's light spills.
 *
 * Units: world units; the row starts at the origin and recedes along ROW_DIR.
 */

export const PW = 1.5
export const PH = 2.1
/** slab thickness (the bevel adds 2 x BEVEL) */
export const PD = 0.16
const BEVEL = 0.035
const RADIUS = 0.05
export const BASE_W = PW + 0.18
export const BASE_H = 0.2
export const BASE_D = PD + 2 * BEVEL + 0.34
/** how far the glass sits down into the base's slot */
const INSET = 0.07
/** glass bottom / top / centre (world y) */
export const GLASS_Y0 = BASE_H - INSET
export const GLASS_Y1 = GLASS_Y0 + PH
/** the etching's uv height hidden inside the slot */
export const SLOT_V = INSET / PH
/** the row: spacing along the row and its direction (receding right and back) */
export const SPACING = 2.35
export const ROW_ANGLE = 0.62
export const ROW_DIR = new THREE.Vector3(Math.cos(ROW_ANGLE), 0, -Math.sin(ROW_ANGLE))

const V_WORLD = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vL;
  varying float vWY;
  void main() {
    vUv = uv;
    vL = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWY = w.y;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

/** the engraving: sandblasted strokes lit from the base */
const ETCH_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uIce, uNeon;
  uniform float uLit, uFront, uAmb, uTint, uGain, uHaze, uMirror, uSlot;
  uniform vec2 uHalf;
  varying vec2 vUv;
  varying vec3 vL;
  varying float vWY;
  void main() {
    vec2 m = texture2D(uMap, vUv).rg;
    // height above the slot, 0 (base) .. ~1 (top)
    float yb = max(vUv.y - uSlot, 0.0) / (1.0 - uSlot);
    // edge-lit: the light enters at the base and fades as it climbs (gently: the
    // quote runs up the glass and has to stay readable at the top)
    float fall = 0.58 + 0.42 * exp(-yb * 2.2);
    // the ignition front climbing from the base
    float front = 1.0 - smoothstep(uFront - 0.14, uFront, yb);
    float e = uLit * front * fall;
    vec3 tint = mix(uIce, uNeon, uTint * exp(-yb * 4.5));
    vec3 col = tint * e * uGain * (m.r + 0.12 * m.g);
    // unlit: the frosting catches a little room light
    col += uIce * uAmb * (m.r * (0.55 + 0.45 * yb) + 0.05 * m.g);
    // light haze in the clear glass just above the slot
    vec2 q = abs(vec2(vL.x, vL.y - uHalf.y)) - (uHalf - vec2(0.06));
    float inside = 1.0 - smoothstep(-0.05, 0.02, max(q.x, q.y));
    col += uNeon * uHaze * uLit * front * exp(-yb * 11.0) * inside;
    // the mirror copy fades with depth below the floor
    if (uMirror > 0.5) col *= 0.16 * exp(vWY * 2.2);
    gl_FragColor = vec4(col, 1.0);
  }
`

/** light leaking out of the slab's polished edges */
const EDGE_VERT = /* glsl */ `
  varying vec3 vL;
  varying vec3 vNl;
  varying vec3 vN;
  varying vec3 vV;
  varying float vWY;
  void main() {
    vL = position;
    vNl = normal;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWY = w.y;
    vec4 mv = viewMatrix * w;
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`
const EDGE_FRAG = /* glsl */ `
  uniform vec3 uIce, uNeon;
  uniform float uLit, uFront, uAmb, uY0, uY1, uMirror;
  varying vec3 vL;
  varying vec3 vNl;
  varying vec3 vN;
  varying vec3 vV;
  varying float vWY;
  void main() {
    vec3 n = normalize(vNl);
    float yb = clamp((vL.y - uY0) / (uY1 - uY0), 0.0, 1.0);
    float top = smoothstep(0.55, 0.95, n.y);
    float side = 1.0 - smoothstep(0.25, 0.7, abs(n.y));
    // the light reaches the top edge once the front has climbed the glass
    float reach = smoothstep(0.8, 1.05, uFront);
    float nv = abs(dot(normalize(vN), normalize(vV)));
    float rim = 0.35 + 0.65 * (1.0 - nv);
    float lit = uLit * (top * 0.7 * reach + side * (0.04 + 0.5 * exp(-yb * 3.6)) * (1.0 - smoothstep(uFront - 0.1, uFront + 0.05, yb)));
    vec3 col = mix(uIce, uNeon, 0.22 + 0.3 * exp(-yb * 5.0)) * lit * rim;
    col += uIce * uAmb * (top * 0.5 + side * 0.25) * rim;
    if (uMirror > 0.5) col *= 0.16 * exp(vWY * 2.2);
    gl_FragColor = vec4(col, 1.0);
  }
`

/** the LED slot on the base's top face: a hot line at the glass and a soft pool */
const STRIP_FRAG = /* glsl */ `
  uniform vec3 uNeon;
  uniform float uStrip, uGap, uHalfW;
  varying vec2 vUv;
  varying vec3 vL;
  varying float vWY;
  void main() {
    // plane lies in x (along the plaque) and y (depth, before the rotation)
    float z = abs(vL.y);
    float dz = z - uGap;
    // the lip of the slot, hugging the glass on both faces
    float line = exp(-dz * dz / (0.014 * 0.014));
    // the LED itself, under the glass (seen through its bottom edge)
    float under = (1.0 - smoothstep(uGap - 0.03, uGap, z)) * 0.14;
    // its glow on the base's top face (drawn here: bloom would bead a line this thin)
    float pool = (exp(-max(dz, 0.0) / 0.03) * 0.22 + exp(-max(dz, 0.0) / 0.12) * 0.08) * step(0.0, dz);
    float ends = 1.0 - smoothstep(uHalfW - 0.14, uHalfW, abs(vL.x));
    vec3 col = uNeon * (line + under + pool) * ends * uStrip;
    // the core runs white-hot
    col += vec3(1.0) * line * line * ends * uStrip * 0.22;
    gl_FragColor = vec4(col, 1.0);
  }
`

/** the black floor: soft pools of spill light (one per plaque) */
const FLOOR_FRAG = /* glsl */ `
  uniform vec4 uPool[8];
  uniform vec3 uPoolCol[8];
  varying vec2 vUv;
  varying vec3 vL;
  varying float vWY;
  varying vec3 vW;
  void main() {
    vec3 col = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      vec4 p = uPool[i];
      vec2 d = (vW.xz - p.xy) / vec2(1.05, 0.55);
      col += uPoolCol[i] * p.z * exp(-dot(d, d) * 1.6);
    }
    float edge = 1.0 - smoothstep(0.3, 0.5, length(vUv - 0.5));
    gl_FragColor = vec4(col * edge, 1.0);
  }
`
const FLOOR_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vL;
  varying float vWY;
  varying vec3 vW;
  void main() {
    vUv = uv;
    vL = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vWY = w.y;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

export interface PlaqueUniforms {
  lit: { value: number }
  front: { value: number }
  amb: { value: number }
  strip: { value: number }
}

export interface Plaque {
  index: number
  root: THREE.Group
  /** env reflections on the faces / bevels (per plaque: depth fade) */
  caps: THREE.MeshStandardMaterial
  sides: THREE.MeshStandardMaterial
  base: THREE.MeshStandardMaterial
  etch: THREE.ShaderMaterial
  edge: THREE.ShaderMaterial
  strip: THREE.ShaderMaterial
  mEtch: THREE.ShaderMaterial
  mEdge: THREE.ShaderMaterial
  neon: THREE.Color
}

export interface Row {
  root: THREE.Group
  plaques: Plaque[]
  floor: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  pools: THREE.Vector4[]
  poolCols: THREE.Color[]
}

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false)
  s.lineTo(x + w, y + h - r)
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false)
  s.lineTo(x + r, y + h)
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(x, y + r)
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false)
  return s
}

/** where plaque (or continuous index) f stands on the floor */
export function rowPos(f: number, out: THREE.Vector3) {
  return out.copy(ROW_DIR).multiplyScalar(f * SPACING)
}

/** the slab (groups: 0 = faces, 1 = sides + bevel), bottom at y = 0 */
function slabGeometry(mobile: boolean) {
  const raw = new THREE.ExtrudeGeometry(roundedRect(PW - 2 * BEVEL * 0.9, PH - 2 * BEVEL * 0.9, RADIUS), {
    depth: PD,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL * 0.9,
    bevelSegments: mobile ? 4 : 6,
    curveSegments: mobile ? 6 : 10,
    steps: 1,
  })
  raw.translate(0, PH / 2, -PD / 2)
  const geo = toCreasedNormals(raw, Math.PI / 4.5)
  raw.dispose()
  smoothSides(geo)
  flattenCaps(geo)
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  return geo
}

export function buildRow(n: number, maps: THREE.Texture[], envMap: THREE.Texture | null, mobile: boolean): Row {
  const root = new THREE.Group()
  const slab = slabGeometry(mobile)
  const baseGeo = new RoundedBoxGeometry(BASE_W, BASE_H, BASE_D, mobile ? 2 : 3, 0.028)
  const etchGeo = new THREE.PlaneGeometry(PW, PH)
  etchGeo.translate(0, PH / 2, 0)
  const stripGeo = new THREE.PlaneGeometry(PW + 0.04, BASE_D * 0.92)

  // clear glass: specular only, added over what's behind
  const capsBase = new THREE.MeshStandardMaterial({
    color: 0x000000,
    roughness: 0.0,
    metalness: 0,
    envMap,
    envMapIntensity: 1,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const sidesBase = capsBase.clone()
  sidesBase.roughness = 0.07
  sidesBase.envMapIntensity = 2.2
  // dark anodised base: soft strip highlights on its rounded edges
  const baseMat = new THREE.MeshStandardMaterial({ color: '#4a4f58', metalness: 1, roughness: 0.2, envMap, envMapIntensity: 0.9 })
  const blackBase = new THREE.MeshBasicMaterial({ color: 0x000000 })
  const hidden = new THREE.MeshBasicMaterial({ visible: false })

  const ice = new THREE.Color(G.ice)
  const etchBase = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: null },
      uIce: { value: ice },
      uNeon: { value: new THREE.Color() },
      uLit: { value: 0 },
      uFront: { value: 0 },
      uAmb: { value: 0 },
      uTint: { value: 0.32 },
      uGain: { value: mobile ? 1.4 : 1.32 },
      uHaze: { value: 0.07 },
      uMirror: { value: 0 },
      uSlot: { value: SLOT_V },
      uHalf: { value: new THREE.Vector2(PW / 2, PH / 2) },
    },
    vertexShader: V_WORLD,
    fragmentShader: ETCH_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  })
  const edgeBase = new THREE.ShaderMaterial({
    uniforms: {
      uIce: { value: ice },
      uNeon: { value: new THREE.Color() },
      uLit: { value: 0 },
      uFront: { value: 0 },
      uAmb: { value: 0 },
      uY0: { value: INSET },
      uY1: { value: PH },
      uMirror: { value: 0 },
    },
    vertexShader: EDGE_VERT,
    fragmentShader: EDGE_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  })
  const stripBase = new THREE.ShaderMaterial({
    uniforms: {
      uNeon: { value: new THREE.Color() },
      uStrip: { value: 0 },
      uGap: { value: PD / 2 + BEVEL },
      uHalfW: { value: (PW + 0.04) / 2 },
    },
    vertexShader: V_WORLD,
    fragmentShader: STRIP_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })

  const plaques: Plaque[] = []
  const pos = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    const neon = new THREE.Color(i % 2 === 0 ? G.neonA : G.neonB)
    const plaque = new THREE.Group()
    rowPos(i, pos)
    plaque.position.copy(pos)
    root.add(plaque)

    // ---- the base, the slot light
    const base = baseMat.clone()
    const baseMesh = new THREE.Mesh(baseGeo, base)
    baseMesh.position.y = BASE_H / 2
    plaque.add(baseMesh)
    const strip = stripBase.clone()
    strip.uniforms.uNeon.value = neon
    const stripMesh = new THREE.Mesh(stripGeo, strip)
    stripMesh.rotation.x = -Math.PI / 2
    stripMesh.position.y = BASE_H + 0.002
    stripMesh.renderOrder = 2
    plaque.add(stripMesh)

    // ---- the glass
    const glass = new THREE.Group()
    glass.position.y = GLASS_Y0
    plaque.add(glass)
    const caps = capsBase.clone()
    const sides = sidesBase.clone()
    const body = new THREE.Mesh(slab, [caps, sides])
    body.renderOrder = 3
    glass.add(body)
    const edge = edgeBase.clone()
    edge.uniforms.uIce.value = ice
    edge.uniforms.uNeon.value = neon
    const edgeMesh = new THREE.Mesh(slab, [hidden, edge])
    edgeMesh.renderOrder = 4
    glass.add(edgeMesh)
    const etch = etchBase.clone()
    etch.uniforms.uMap.value = maps[i]
    etch.uniforms.uIce.value = ice
    etch.uniforms.uNeon.value = neon
    const etchMesh = new THREE.Mesh(etchGeo, etch)
    // engraved on the back face, read through the thickness of the glass
    etchMesh.position.z = -PD / 2 + 0.012
    etchMesh.renderOrder = 3
    glass.add(etchMesh)

    // ---- the reflection (y → −y about the floor)
    const mirror = new THREE.Group()
    mirror.scale.y = -1
    plaque.add(mirror)
    const mBase = new THREE.Mesh(baseGeo, blackBase)
    mBase.position.y = BASE_H / 2
    mirror.add(mBase)
    const mGlass = new THREE.Group()
    mGlass.position.y = GLASS_Y0
    mirror.add(mGlass)
    const mEtch = etch.clone()
    mEtch.uniforms.uMap.value = maps[i]
    mEtch.uniforms.uIce.value = ice
    mEtch.uniforms.uNeon.value = neon
    mEtch.uniforms.uMirror.value = 1
    const mEtchMesh = new THREE.Mesh(etchGeo, mEtch)
    mEtchMesh.position.z = etchMesh.position.z
    mGlass.add(mEtchMesh)
    const mEdge = edge.clone()
    mEdge.uniforms.uIce.value = ice
    mEdge.uniforms.uNeon.value = neon
    mEdge.uniforms.uMirror.value = 1
    mGlass.add(new THREE.Mesh(slab, [hidden, mEdge]))

    plaques.push({ index: i, root: plaque, caps, sides, base, etch, edge, strip, mEtch, mEdge, neon })
  }

  // ---- the floor
  const pools = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0))
  const white = new THREE.Color(1, 1, 1)
  const poolCols = Array.from({ length: 8 }, (_, i) => (plaques[i] ? plaques[i].neon.clone().lerp(white, 0.3) : new THREE.Color(0, 0, 0)))
  const floorMat = new THREE.ShaderMaterial({
    uniforms: { uPool: { value: pools }, uPoolCol: { value: poolCols } },
    vertexShader: FLOOR_VERT,
    fragmentShader: FLOOR_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 0.001
  floor.renderOrder = 1
  floor.frustumCulled = false
  root.add(floor)

  return { root, plaques, floor, pools, poolCols }
}
