import * as THREE from 'three'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import { rng } from '../../core/math'

/*
 * THE BREATH PANE — one large sheet of cold glass standing in the black room,
 * fogged with condensation and lit from behind.
 *
 *  - the SLAB: a thick rounded glass sheet whose polished bevel and edges
 *    catch razor highlights from the studio strips; its caps are hidden — the
 *    front face is the fog shader below.
 *  - the FOG FACE (custom shader, opaque, cheap): what you see through the
 *    pane is a light wall a little behind it (a broad soft glow, a hot core,
 *    two hairline light tubes), with true parallax. Condensation diffuses and
 *    dims that light into a soft sandblasted glow, textured with droplets
 *    (tiny lenses: a bright centre, a dark rim, a glint). Where the finger has
 *    written (script.ts masks) the glass is CLEAR: the backlight shines
 *    through crisp, with a beaded meniscus along each stroke edge and faint
 *    wipe streaks; drips run down from the baseline; the fog re-forms.
 *
 * Units: the pane is PW x PH world units, centred at its group's origin,
 * facing +z.
 */

export const PW = 6.4
export const PH = 4.0
export const PD = 0.1
const BEVEL = 0.034
const RADIUS = 0.07
/** the name mask sits here on the pane (centre xy, size wh; w/h = MW/MH) */
export const REGION = { x: 0, y: 0.12, w: 5.6, h: 1.4 }
/** the front face (the fog) z, in pane space */
export const FACE_Z = PD / 2 + BEVEL + 0.0006

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

/** a tileable condensation map: rg = droplet normal, b = coverage (mipmapped) */
function dropletTexture(size: number, seed: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = 128
    data[i * 4 + 1] = 128
    data[i * 4 + 2] = 0
    data[i * 4 + 3] = 255
  }
  const occ = new Uint8Array(size * size)
  const rand = rng(seed)
  const wrap = (v: number) => ((v % size) + size) % size
  const free = (cx: number, cy: number, r: number) => {
    const rr = r + 1.2
    if (occ[wrap(Math.round(cy)) * size + wrap(Math.round(cx))]) return false
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2
      if (occ[wrap(Math.round(cy + Math.sin(a) * rr)) * size + wrap(Math.round(cx + Math.cos(a) * rr))]) return false
    }
    return true
  }
  let placed = 0
  for (let tries = 0; tries < 26000 && placed < 5200; tries++) {
    // many fine droplets, fewer big ones
    const r = 0.9 + 7.2 * Math.pow(rand(), 3.4)
    const cx = rand() * size
    const cy = rand() * size
    if (!free(cx, cy, r)) continue
    placed++
    const ext = Math.ceil(r) + 1
    for (let dy = -ext; dy <= ext; dy++) {
      for (let dx = -ext; dx <= ext; dx++) {
        const px = Math.floor(cx) + dx
        const py = Math.floor(cy) + dy
        const fx = px + 0.5 - cx
        const fy = py + 0.5 - cy
        const d = Math.sqrt(fx * fx + fy * fy) / r
        const cov = Math.max(0, Math.min(1, (1 - d) * r + 0.5))
        if (cov <= 0) continue
        const k = wrap(py) * size + wrap(px)
        const nx = Math.max(-1, Math.min(1, fx / r))
        const ny = Math.max(-1, Math.min(1, fy / r))
        data[k * 4] = Math.round(128 + nx * 127)
        data[k * 4 + 1] = Math.round(128 + ny * 127)
        data[k * 4 + 2] = Math.max(data[k * 4 + 2], Math.round(cov * 255))
        occ[k] = 1
      }
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

const VERT = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */ `
  uniform sampler2D uMask;
  uniform sampler2D uDrops;
  uniform float uHasMask;
  uniform vec4 uRegion;
  uniform vec3 uCam;
  uniform float uWallZ;
  uniform vec2 uGlow;
  uniform vec2 uDiscAt;
  uniform vec2 uDisc;
  uniform float uLight;
  uniform float uWrite, uCoWrite, uCapN, uCapC, uRefog;
  uniform float uBloom;
  uniform vec2 uBloomAt;
  uniform float uHeavy;
  uniform float uSweep, uSweepK;
  uniform vec4 uDrip0, uDrip1;
  uniform float uDropScale;
  uniform float uFogK;
  varying vec2 vP;

  float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
  float g1(float x, float s) { return exp(-0.5 * x * x / (s * s)); }

  // THE LIGHT BEHIND, seen through clear glass: a broad soft glow and an oval
  // softbox behind the writing (hot centre, crisp rim), b = a little blur
  float wall(vec2 q, float b) {
    vec2 d = q - uGlow;
    float glow = 0.2 * g1(d.x, 1.9) * g1(d.y, 1.15);
    float rmin = min(uDisc.x, uDisc.y);
    float r = length((q - uDiscAt) / uDisc);
    float e = (0.012 + 0.9 * b) / rmin;
    float disc = 0.66 * (1.0 - 0.3 * smoothstep(0.0, 1.0, r)) * (1.0 - smoothstep(1.0 - e, 1.0 + e, r));
    return (glow + disc) * uLight;
  }
  // the same light diffused by condensation: soft, no rim (b = extra blur)
  float wallFog(vec2 q, float b) {
    float b2 = b * b;
    vec2 d = q - uGlow;
    float sx = sqrt(2.0 * 2.0 + b2), sy = sqrt(1.2 * 1.2 + b2);
    float broad = 0.62 * (2.0 / sx) * (1.2 / sy) * g1(d.x, sx) * g1(d.y, sy);
    float cx = sqrt(1.1 * 1.1 + b2), cy = sqrt(0.6 * 0.6 + b2);
    float core = 0.45 * (1.1 / cx) * (0.6 / cy) * g1(d.x, cx) * g1(d.y, cy);
    return (broad + core) * uLight;
  }

  // a drip trail below (d.x, d.y), d.z long, d.w half-wide; head = its bead
  float drip(vec4 d, vec2 P, out float head, out vec2 hn) {
    float dy = d.y - P.y;
    float wob = 0.018 * sin(dy * 7.0 + d.x * 5.0) * smoothstep(0.0, 0.35, dy);
    float xc = d.x + wob;
    float w = d.w * (0.5 + 0.3 * smoothstep(0.0, 0.2, dy));
    float trail = (1.0 - smoothstep(w * 0.6, w, abs(P.x - xc))) * step(0.0, dy) * (1.0 - smoothstep(d.z - 0.02, d.z, dy));
    float hwob = 0.018 * sin(d.z * 7.0 + d.x * 5.0) * smoothstep(0.0, 0.35, d.z);
    vec2 hp = vec2(d.x + hwob, d.y - d.z);
    float hr = d.w * 1.35 * smoothstep(0.0, 0.05, d.z);
    vec2 o = (P - hp) / max(hr, 1e-4);
    head = (1.0 - smoothstep(0.8, 1.0, length(o))) * step(1e-4, hr);
    hn = o;
    return trail * step(1e-4, d.z);
  }

  void main() {
    vec2 P = vP;
    // the view ray through this point onto the light wall (true parallax)
    vec3 rd = normalize(vec3(P, 0.0) - uCam);
    float t = uWallZ / max(-rd.z, 0.05);
    vec2 qV = P + rd.xy * t;

    // ---- the finger writing
    vec2 mu = (P - uRegion.xy) / uRegion.zw + 0.5;
    float inR = step(0.0, mu.x) * step(mu.x, 1.0) * step(0.0, mu.y) * step(mu.y, 1.0) * uHasMask;
    vec4 m = texture2D(uMask, clamp(mu, vec2(0.0), vec2(1.0)));
    float shrink = max(0.1, 1.0 - 0.45 * uRefog);
    float Rn = mix(8.0, m.r, inR) / shrink;
    float Rc = mix(8.0, m.b, inR) / shrink;
    float aaN = fwidth(Rn) * 0.75 + 0.015;
    float aaC = fwidth(Rc) * 0.75 + 0.015;
    float wN = uWrite + uCapN * min(1.0, uWrite / max(uCapN, 1e-4)) * sqrt(max(0.0, 1.0 - min(Rn * Rn, 1.0)));
    float wC = uCoWrite + uCapC * min(1.0, uCoWrite / max(uCapC, 1e-4)) * sqrt(max(0.0, 1.0 - min(Rc * Rc, 1.0)));
    float revN = smoothstep(0.0, uCapN * 0.3 + 1e-4, wN - m.g) * step(1e-4, uWrite);
    float revC = smoothstep(0.0, uCapC * 0.3 + 1e-4, wC - m.a) * step(1e-4, uCoWrite);
    float clearN = (1.0 - smoothstep(1.0 - aaN, 1.0 + aaN, Rn)) * revN;
    float clearC = (1.0 - smoothstep(1.0 - aaC, 1.0 + aaC, Rc)) * revC;
    // the fog re-forms: fine droplets nucleate inside the strokes
    float nuc = smoothstep(0.0, 0.7, uRefog * 1.25 - fbm(P * 11.0) * 0.55);
    float c = max(clearN, clearC) * (1.0 - nuc);
    // faint wipe streaks along each stroke (they follow the centreline)
    float streak = 0.5 + 0.5 * sin(Rn * 17.0 + fbm(P * 3.0) * 6.0);
    // drips
    float h0, h1; vec2 n0, n1;
    float tr = max(drip(uDrip0, P, h0, n0), drip(uDrip1, P, h1, n1));
    c = max(c, tr * (1.0 - nuc));
    float bead = max(h0, h1) * (1.0 - nuc);
    vec2 bn = h0 > h1 ? n0 : n1;

    // ---- light
    float Bs = wall(qV, 0.0);
    float Bd = wallFog(P, 0.9 * uHeavy);

    // ---- condensation
    vec4 dA = texture2D(uDrops, P * uDropScale);
    vec4 dB = texture2D(uDrops, P * uDropScale * 0.43 + vec2(0.37, 0.61));
    float grain = fbm(P * 23.0);
    float fk = uFogK * (1.0 + 0.5 * uHeavy);
    // condensation is patchy: thicker low on the pane, thinner in drifts
    float drifts = fbm(P * 0.9 + 11.0);
    float fog = Bd * fk * (0.9 + 0.14 * grain) * (0.84 + 0.32 * drifts) + 0.003;
    // droplets: tiny lenses (the backlight through them, inverted), dark rims, a glint
    vec2 n = dA.xy * 2.0 - 1.0;
    float nl = length(n);
    float rim = smoothstep(0.5, 1.0, nl);
    float lens = wallFog(qV - n * 0.3, 0.0) * fk * 1.55;
    float gl = max(dot(n, vec2(-0.55, 0.83)), 0.0);
    gl = gl * gl; gl = gl * gl;
    float drop = lens * (1.0 - 0.75 * rim) + gl * Bd * fk * 2.2;
    fog = mix(fog, drop, dA.z * 0.45 * (1.0 - 0.85 * uHeavy));
    // the pushed-aside water: a band of bigger beads hugging each stroke
    float band = (1.0 - smoothstep(1.15, 2.2, Rn)) * smoothstep(0.95, 1.1, Rn) * revN * (1.0 - uRefog);
    vec2 nb = dB.xy * 2.0 - 1.0;
    float beadB = wall(qV - nb * 0.25, 0.05) * 0.45 * (1.0 - 0.9 * smoothstep(0.5, 1.0, length(nb)));
    fog = mix(fog, beadB, dB.z * band * 0.8);

    // the breath: fog blooms outward from a point (uBloom = the front's radius)
    float front = uBloom - length((P - uBloomAt) * vec2(0.8, 1.0)) + (fbm(P * 1.4 + 3.0) - 0.5) * 1.1;
    float dens = smoothstep(-0.05, 0.35, front);
    dens *= mix(smoothstep(0.1, 0.6, dA.z + front * 2.0), 1.0, smoothstep(0.0, 0.35, front));

    // clear glass: the backlight, crisp (a hair dimmer), wipe streaks, the light sweep
    float s = dot(P, vec2(0.91, 0.41)) - uSweep;
    // the freshest stretch behind the fingertip is still wet: a touch brighter
    float wet = (1.0 - smoothstep(0.0, uCapN * 5.0, uWrite - m.g)) * (1.0 - step(0.999, uWrite));
    float clearL = Bs * 0.93 * (1.0 - 0.035 * streak * smoothstep(0.25, 0.7, Rn)) * (1.0 + 0.16 * wet) + exp(-s * s / 0.0012) * 0.55 * uSweepK;
    float glassL = Bs * 0.93 + exp(-s * s / 0.0012) * 0.4 * uSweepK;
    float L = mix(glassL, fog + exp(-s * s / 0.6) * 0.022 * uSweepK, dens);
    L = mix(L, clearL, c * dens);
    // the meniscus: a thin bright bead line along the stroke edges
    float men = exp(-(Rn - 1.12) * (Rn - 1.12) / 0.006) * revN * (1.0 - uRefog) * inR;
    L += men * (0.16 * Bs + 0.01) * dens;
    // drip beads: little lenses
    float beadL = wall(qV - bn * 0.3, 0.02) * (1.0 - 0.85 * smoothstep(0.55, 1.0, length(bn))) + max(dot(bn, vec2(-0.55, 0.83)), 0.0) * 0.12;
    L = mix(L, beadL, bead * dens);

    vec3 tint = mix(vec3(0.93, 0.96, 1.0), vec3(1.0), c);
    gl_FragColor = vec4(max(L, 0.0) * tint, 1.0);
  }
`

export interface Pane {
  root: THREE.Group
  face: THREE.Mesh
  slab: THREE.Mesh
  edge: THREE.MeshPhysicalMaterial
  u: {
    uMask: { value: THREE.Texture | null }
    uDrops: { value: THREE.Texture }
    uHasMask: { value: number }
    uRegion: { value: THREE.Vector4 }
    uCam: { value: THREE.Vector3 }
    uWallZ: { value: number }
    uGlow: { value: THREE.Vector2 }
    uDiscAt: { value: THREE.Vector2 }
    uDisc: { value: THREE.Vector2 }
    uLight: { value: number }
    uWrite: { value: number }
    uCoWrite: { value: number }
    uCapN: { value: number }
    uCapC: { value: number }
    uRefog: { value: number }
    uBloom: { value: number }
    uBloomAt: { value: THREE.Vector2 }
    uHeavy: { value: number }
    uSweep: { value: number }
    uSweepK: { value: number }
    uDrip0: { value: THREE.Vector4 }
    uDrip1: { value: THREE.Vector4 }
    uDropScale: { value: number }
    uFogK: { value: number }
  }
}

export function makePane(mobile: boolean): Pane {
  const shape = roundedRect(PW, PH, RADIUS)
  // the slab: hidden caps, polished transmissive bevel + edges
  const ex = new THREE.ExtrudeGeometry(shape, {
    depth: PD,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL * 0.9,
    bevelSegments: mobile ? 4 : 7,
    curveSegments: 10,
    steps: 1,
  })
  ex.translate(0, 0, -PD / 2)
  const slabGeo = toCreasedNormals(ex, Math.PI / 4.5)
  ex.dispose()
  const hidden = new THREE.MeshBasicMaterial({ visible: false })
  // polished edges: black glass with crisp studio reflections. Not
  // transmissive on purpose — behind a 2 px bevel there is only black, and a
  // transmission pass would render the whole fog face a second time
  const edge = new THREE.MeshPhysicalMaterial({
    color: 0x07080a,
    metalness: 0,
    roughness: 0.05,
    ior: 1.5,
    specularIntensity: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.025,
    envMapIntensity: 1.6,
  })
  const slab = new THREE.Mesh(slabGeo, [hidden, edge])

  const u: Pane['u'] = {
    uMask: { value: null },
    uDrops: { value: dropletTexture(512, 7) },
    uHasMask: { value: 0 },
    uRegion: { value: new THREE.Vector4(REGION.x, REGION.y, REGION.w, REGION.h) },
    uCam: { value: new THREE.Vector3(0, 0, 10) },
    uWallZ: { value: 1.0 },
    uGlow: { value: new THREE.Vector2(0, REGION.y) },
    uDiscAt: { value: new THREE.Vector2(0, REGION.y + 0.02) },
    uDisc: { value: new THREE.Vector2(2.9, 1.35) },
    uLight: { value: 1 },
    uWrite: { value: 0 },
    uCoWrite: { value: 0 },
    uCapN: { value: 0.01 },
    uCapC: { value: 0.01 },
    uRefog: { value: 0 },
    uBloom: { value: 20 },
    uBloomAt: { value: new THREE.Vector2(0.4, 0.1) },
    uHeavy: { value: 0 },
    uSweep: { value: -9 },
    uSweepK: { value: 0 },
    uDrip0: { value: new THREE.Vector4(0, 0, 0, 0.02) },
    uDrip1: { value: new THREE.Vector4(0, 0, 0, 0.02) },
    uDropScale: { value: mobile ? 0.95 : 0.8 },
    uFogK: { value: 0.24 },
  }
  const faceMat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG })
  const faceGeo = new THREE.ShapeGeometry(shape, 12)
  const face = new THREE.Mesh(faceGeo, faceMat)
  face.position.z = FACE_Z
  const root = new THREE.Group()
  root.add(slab, face)
  return { root, face, slab, edge, u }
}
