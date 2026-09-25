import * as THREE from 'three'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import { flattenCaps, frosted, polished, smoothSides } from '../../kit/glass'
import { SERVICES } from '../../content'
import { buildAtlas, type Atlas } from './icons'

/*
 * The Etched deck: eleven thick glass plates hung as a column of louvres.
 *
 * Each plate is ONE mesh with two materials: sandblasted caps (frosted
 * transmission, roughness animates: the plate in view thaws a little) and
 * polished sides + bevel (crisp studio strips, a clearcoat). The service is
 * etched in reverse: two planes per plate sample one atlas —
 *
 *   glow   inside the glass, OPAQUE list + additive: three's transmission
 *          pass captures it and the frost diffuses it (light bleeding
 *          through the sandblast around the etched lines)
 *   face   just in front of the front cap, transparent + additive: the clear
 *          etched lines themselves, razor sharp
 *
 * Behind the plate in view hangs the BACKLIGHT: an opaque additive softbox
 * the frost glows with, and whose tail shows around the plate's edges, so
 * the polished bevel reads as a crisp line against light.
 */

export const N = SERVICES.length
export const TILE_W = 1.64
export const TILE_H = 1.08
/** flat thickness (the bevel adds 2 x BEVEL) */
export const TILE_D = 0.06
export const BEVEL = 0.06
export const FRONT_Z = TILE_D / 2 + BEVEL
const RADIUS = 0.1
const PLATE_INSET = 0.075

export interface Plate {
  index: number
  holder: THREE.Group
  mesh: THREE.Mesh
  caps: THREE.MeshPhysicalMaterial
  sides: THREE.MeshPhysicalMaterial
  face: THREE.Mesh
  faceMat: THREE.ShaderMaterial
  glow: THREE.Mesh
  glowMat: THREE.ShaderMaterial
}

export interface Deck {
  /** the column (yawed a little for a three-quarter view) */
  column: THREE.Group
  plates: Plate[]
  /** the backlight softbox (sits behind the plate in view, faces the camera) */
  back: THREE.Mesh
  backMat: THREE.ShaderMaterial
  atlas: Atlas
  tex: THREE.CanvasTexture
}

const PLATE_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec2 vP;
  void main() {
    vUv = uv;
    vP = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/** crisp etched lines (R) + a slow light sweep across them */
const FACE_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uBright, uSweep, uSweepAmt;
  varying vec2 vUv;
  varying vec2 vP;
  void main() {
    float v = texture2D(uMap, vUv).r;
    float s = (vP.x * 0.8 + vP.y * 0.55) - uSweep;
    float band = exp(-(s * s) / 0.035);
    gl_FragColor = vec4(uColor * v * (uBright + uSweepAmt * band), 1.0);
  }
`

/** the blurred icon light inside the glass (G) */
const GLOW_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uBright;
  varying vec2 vUv;
  void main() {
    float v = texture2D(uMap, vUv).g;
    gl_FragColor = vec4(uColor * v * uBright, 1.0);
  }
`

/** a soft rounded-rect softbox (a slit … a plate-sized box), a hot spot and a faint tail */
const BACK_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec2 uHalf, uHot;
  uniform float uStrength, uRadius, uSoft, uTail, uTailAmt;
  varying vec2 vP;
  void main() {
    vec2 hb = max(uHalf, vec2(0.02));
    float rr = min(uRadius, min(hb.x, hb.y));
    vec2 q = abs(vP) - (hb - vec2(rr));
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rr;
    float box = 1.0 - smoothstep(-uSoft, uSoft, d);
    vec2 e = vP / (hb + vec2(0.3));
    float tail = exp(-dot(e, e) * uTail);
    vec2 h = (vP - uHot * hb) / hb;
    float hot = exp(-dot(h, h) * 1.1);
    float v = box * (0.4 + 0.6 * hot) + tail * uTailAmt;
    gl_FragColor = vec4(uColor * v * uStrength, 1.0);
  }
`

function roundedRect(w: number, h: number, r: number): THREE.Shape {
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

export function buildDeck(mobile: boolean, envMap: THREE.Texture | null): Deck {
  // ---- the plate: one bevelled slab, groups 0 = caps (frosted), 1 = sides + bevel (polished)
  const shape = roundedRect(TILE_W - 2 * BEVEL * 0.9, TILE_H - 2 * BEVEL * 0.9, RADIUS)
  const raw = new THREE.ExtrudeGeometry(shape, {
    depth: TILE_D,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL * 0.9,
    bevelSegments: mobile ? 5 : 8,
    curveSegments: mobile ? 8 : 12,
    steps: 1,
  })
  raw.translate(0, 0, -TILE_D / 2)
  // non-indexed: creased normals keep the material groups (0 = caps, 1 = sides + bevel)
  const geo = toCreasedNormals(raw, Math.PI / 4.5)
  // clean normals for close-ups: one consistent smooth normal per bevel corner
  // (creased-only normals zigzag the strip reflections along every edge) and
  // exactly flat sandblasted caps (no shading 'spokes' fanning in from the rim)
  smoothSides(geo)
  flattenCaps(geo)
  geo.computeBoundingBox()
  geo.computeBoundingSphere()

  const capsBase = frosted({ frost: 0.5, thickness: 0.35 })
  const sidesBase = polished({ thickness: 0.35 })

  // ---- the etched atlas (R crisp, G glow)
  const cellW = mobile ? 540 : 800
  const cellH = Math.round((cellW * (TILE_H - 2 * PLATE_INSET)) / (TILE_W - 2 * PLATE_INSET))
  const atlas = buildAtlas(cellW, cellH, mobile ? 1.35 : 1)
  const tex = new THREE.CanvasTexture(atlas.canvas)
  tex.colorSpace = THREE.NoColorSpace
  tex.anisotropy = 8
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  const redraw = () => {
    atlas.draw()
    tex.needsUpdate = true
  }
  document.fonts?.load("400 24px 'Fragment Mono'").then(redraw, () => {})

  const column = new THREE.Group()
  const plates: Plate[] = []
  const pw = TILE_W - 2 * PLATE_INSET
  const ph = TILE_H - 2 * PLATE_INSET
  for (let i = 0; i < N; i++) {
    const holder = new THREE.Group()
    holder.rotation.order = 'YXZ'
    column.add(holder)

    const caps = capsBase.clone()
    const sides = sidesBase.clone()
    // a touch of roughness on the polish: highlights stay razor thin but never
    // shrink below a pixel (sub-pixel HDR lines alias into beads under bloom)
    sides.roughness = 0.06
    sides.clearcoatRoughness = 0.08
    caps.envMap = envMap
    sides.envMap = envMap
    const mesh = new THREE.Mesh(geo, [caps, sides])
    mesh.userData.plate = i
    holder.add(mesh)

    const pg = new THREE.PlaneGeometry(pw, ph)
    const [u0, v0, u1, v1] = atlas.rect(i)
    const uv = pg.getAttribute('uv') as THREE.BufferAttribute
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0))
    uv.needsUpdate = true

    const faceMat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: tex },
        uColor: { value: new THREE.Color(1, 1, 1) },
        uBright: { value: 0 },
        uSweep: { value: -3 },
        uSweepAmt: { value: 0 },
      },
      vertexShader: PLATE_VERT,
      fragmentShader: FACE_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    const face = new THREE.Mesh(pg, faceMat)
    face.position.z = FRONT_Z + 0.004
    face.renderOrder = 3
    holder.add(face)

    const glowMat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: tex },
        uColor: { value: new THREE.Color(1, 1, 1) },
        uBright: { value: 0 },
      },
      vertexShader: PLATE_VERT,
      fragmentShader: GLOW_FRAG,
      // opaque list + additive: the transmission pass sees it, the frost diffuses it
      transparent: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    const glow = new THREE.Mesh(pg, glowMat)
    glow.position.z = -0.01
    glow.renderOrder = 1
    holder.add(glow)

    plates.push({ index: i, holder, mesh, caps, sides, face, faceMat, glow, glowMat })
  }

  // ---- the backlight softbox
  const backMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#e9eefb') },
      uHalf: { value: new THREE.Vector2(TILE_W * 0.44, TILE_H * 0.4) },
      uStrength: { value: 0 },
      uRadius: { value: 0.18 },
      uSoft: { value: 0.28 },
      uTail: { value: 1.2 },
      uTailAmt: { value: 0.1 },
      uHot: { value: new THREE.Vector2(0.35, 0.45) },
    },
    vertexShader: PLATE_VERT,
    fragmentShader: BACK_FRAG,
    transparent: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })
  const back = new THREE.Mesh(new THREE.PlaneGeometry(7, 9), backMat)
  back.renderOrder = 0

  return { column, plates, back, backMat, atlas, tex }
}
