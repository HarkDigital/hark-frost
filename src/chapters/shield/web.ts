import * as THREE from 'three'
import { rng } from '../../core/math'

/*
 * The strike on laminated glass: a spider-web fracture that never falls apart.
 *
 * From an impact point, jagged RADIAL cracks run out toward the frame (a few
 * stop short), CONCENTRIC ring segments bridge neighbouring radials (denser
 * near the impact, sparser outward, each bowed slightly toward the centre as
 * in real laminated breaks), short FORKS split off the radials, and a tiny
 * CRUSH star marks the point of impact.
 *
 * Every point carries a growth time `g` (≈ distance from the impact / reach,
 * 0..~1.05): the fracture is grown by scroll (visible where g < uGrow), then
 * healed as a material process: frost crystals grow off the seams by g (from
 * the impact outward) and the condensation front covers them from the
 * plate's edges inward.
 */

export type V2 = [number, number]

export interface CrackLine {
  pts: V2[]
  g: number[]
  /** width at the start / end (world units) */
  w0: number
  w1: number
  /** brightness weight */
  k: number
}

export interface Web {
  lines: CrackLine[]
  impact: V2
  reach: number
}

const TAU = Math.PI * 2
const dist = (a: V2, b: V2) => Math.hypot(a[0] - b[0], a[1] - b[1])

export function buildWeb(o: { w: number; h: number; impact: V2; radials: number; seed: number; inset?: number }): Web {
  const R = rng(o.seed)
  const P = o.impact
  const inset = o.inset ?? 0.035
  const hx = o.w / 2 - inset
  const hy = o.h / 2 - inset
  const inside = (p: V2) => Math.abs(p[0]) <= hx && Math.abs(p[1]) <= hy
  /** distance from p along d to the inset frame */
  const toFrame = (p: V2, d: V2) => {
    let t = Infinity
    if (d[0] > 1e-6) t = Math.min(t, (hx - p[0]) / d[0])
    if (d[0] < -1e-6) t = Math.min(t, (-hx - p[0]) / d[0])
    if (d[1] > 1e-6) t = Math.min(t, (hy - p[1]) / d[1])
    if (d[1] < -1e-6) t = Math.min(t, (-hy - p[1]) / d[1])
    return t
  }

  // ---------------- radials: jagged runs from the impact outward
  const n = o.radials
  const a0 = R() * TAU
  const radials: V2[][] = []
  for (let i = 0; i < n; i++) {
    const base = a0 + (i / n) * TAU + (R() - 0.5) * (TAU / n) * 0.55
    const full = toFrame(P, [Math.cos(base), Math.sin(base)])
    // most reach the frame (the interlayer holds the pieces together); some stop short
    const stop = R() < 0.72 ? Infinity : full * (0.45 + R() * 0.4)
    const pts: V2[] = [[P[0] + Math.cos(base) * 0.012, P[1] + Math.sin(base) * 0.012]]
    let ang = base
    let cur = pts[0]
    for (let s = 0; s < 80; s++) {
      const step = 0.055 + R() * 0.075
      // wander, but keep returning toward the ray's own heading
      ang += (R() - 0.5) * 0.3 + (base - ang) * 0.35
      const d: V2 = [Math.cos(ang), Math.sin(ang)]
      const left = toFrame(cur, d)
      const travelled = dist(cur, P)
      if (left <= step || travelled + step >= stop) {
        const t = Math.min(left, Math.max(0.01, stop - travelled))
        pts.push([cur[0] + d[0] * t, cur[1] + d[1] * t])
        break
      }
      cur = [cur[0] + d[0] * step, cur[1] + d[1] * step]
      pts.push(cur)
    }
    radials.push(pts)
  }
  // radials sorted by heading so neighbours are adjacent
  const heading = (pts: V2[]) => Math.atan2(pts[pts.length - 1][1] - P[1], pts[pts.length - 1][0] - P[0])
  radials.sort((a, b) => heading(a) - heading(b))
  let reach = 0
  for (const r of radials) for (const p of r) reach = Math.max(reach, dist(p, P))
  const G = (p: V2) => dist(p, P) / reach

  const lines: CrackLine[] = []
  const line = (pts: V2[], w0: number, w1: number, k: number, g?: number[]) => {
    if (pts.length < 2) return
    lines.push({ pts, g: g ?? pts.map(G), w0, w1, k })
  }
  for (const r of radials) line(r, 0.0078, 0.0042, 1)

  /** the point where a radial first crosses radius r (null if it never does) */
  const atRadius = (pts: V2[], r: number): V2 | null => {
    for (let j = 1; j < pts.length; j++) {
      const da = dist(pts[j - 1], P)
      const db = dist(pts[j], P)
      if (da <= r && db >= r) {
        const t = (r - da) / Math.max(1e-6, db - da)
        return [pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * t, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * t]
      }
    }
    return null
  }

  // ---------------- concentric rings between neighbouring radials
  const rings: number[] = []
  for (let r = 0.075; r < reach * 0.92; r *= 1.5 + R() * 0.18) rings.push(r)
  rings.forEach((r0, k) => {
    const keep = Math.max(0.28, 0.97 - k * 0.12)
    for (let i = 0; i < n; i++) {
      if (R() > keep) continue
      const A = radials[i]
      const B = radials[(i + 1) % n]
      const ra = r0 * (0.9 + R() * 0.2)
      const rb = r0 * (0.9 + R() * 0.2)
      const pa = atRadius(A, ra)
      const pb = atRadius(B, rb)
      if (!pa || !pb) continue
      const span = dist(pa, pb)
      if (span > 0.9 || span < 0.02) continue
      // bowed toward the impact, with a kink or two
      const m = span > 0.25 ? 3 : 2
      const pts: V2[] = [pa]
      for (let j = 1; j < m; j++) {
        const t = j / m
        const q: V2 = [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t]
        const toP: V2 = [P[0] - q[0], P[1] - q[1]]
        const l = Math.hypot(toP[0], toP[1]) || 1
        const bow = span * (0.06 + R() * 0.07) * Math.sin(Math.PI * t)
        const jit = (R() - 0.5) * span * 0.05
        const c: V2 = [q[0] + (toP[0] / l) * (bow + jit), q[1] + (toP[1] / l) * (bow + jit)]
        if (inside(c)) pts.push(c)
      }
      pts.push(pb)
      // rings form just after the radial front passes
      const g0 = Math.max(G(pa), G(pb)) + 0.03
      line(pts, 0.0052, 0.0052, 0.85, pts.map((p, j) => g0 + 0.035 * Math.sin((Math.PI * j) / (pts.length - 1))))
    }
  })

  // ---------------- forks off the radials
  for (const r of radials) {
    const forks = R() < 0.6 ? 2 : 1
    for (let f = 0; f < forks; f++) {
      if (r.length < 4) continue
      const j = 1 + Math.floor(R() * (r.length - 2))
      const O = r[j]
      const hd = Math.atan2(r[j + 1][1] - O[1], r[j + 1][0] - O[0])
      const side = R() < 0.5 ? -1 : 1
      let a = hd + side * (0.35 + R() * 0.35)
      const L = 0.1 + R() * 0.22
      const pts: V2[] = [O]
      let cur = O
      const steps = 3
      for (let s = 0; s < steps; s++) {
        a += (R() - 0.5) * 0.25
        const c: V2 = [cur[0] + Math.cos(a) * (L / steps), cur[1] + Math.sin(a) * (L / steps)]
        if (!inside(c)) break
        pts.push(c)
        cur = c
      }
      const g0 = G(O)
      let acc = 0
      line(
        pts,
        0.0048,
        0.0028,
        0.75,
        pts.map((p, q) => {
          if (q > 0) acc += dist(p, pts[q - 1])
          return g0 + (acc / reach) * 1.2
        }),
      )
    }
  }

  // ---------------- the crush star at the point of impact
  const crush = 18
  for (let i = 0; i < crush; i++) {
    const a = (i / crush) * TAU + (R() - 0.5) * 0.3
    const l = 0.018 + R() * 0.05
    const mid = l * (0.45 + R() * 0.2)
    const pts: V2[] = [
      [P[0] + Math.cos(a) * 0.004, P[1] + Math.sin(a) * 0.004],
      [P[0] + Math.cos(a + (R() - 0.5) * 0.3) * mid, P[1] + Math.sin(a + (R() - 0.5) * 0.3) * mid],
      [P[0] + Math.cos(a) * l, P[1] + Math.sin(a) * l],
    ]
    line(pts, 0.0036, 0.0022, 1.15, [0, 0.008, 0.016 + l / reach])
  }
  // a tiny crushed ring
  {
    const pts: V2[] = []
    const m = 14
    for (let j = 0; j <= m; j++) {
      const t = (j / m) * TAU
      const r = 0.03 * (0.85 + 0.3 * R())
      pts.push([P[0] + Math.cos(t) * r, P[1] + Math.sin(t) * r])
    }
    pts[m] = pts[0]
    line(pts, 0.0034, 0.0034, 1, pts.map(() => 0.02))
  }

  return { lines, impact: P, reach }
}

/**
 * Ribbons along the crack lines, lying flat at `z`, mitred at the joints and
 * WIDE: each carries the razor-thin crack core down its middle and room on
 * either side for the frost crystals that later grow off it.
 *
 *   aM = (g growth time, s -1..1 across, k brightness weight)
 *   aC = (u distance along the line + a per-line offset, ribbon half-width,
 *         core half-width, crystal reach) — all in plate units
 */
export function webGeometry(lines: CrackLine[], z: number, o: { widthScale?: number; reach?: number; seed?: number } = {}): THREE.BufferGeometry {
  const widthScale = o.widthScale ?? 1
  const reachMax = o.reach ?? 0.05
  const R = rng(o.seed ?? 5)
  const pos: number[] = []
  const mA: number[] = []
  const cA: number[] = []
  const idx: number[] = []
  for (const ln of lines) {
    const P = ln.pts
    const n = P.length
    if (n < 2) continue
    // heavier cracks grow longer crystals (radials 1, rings .75, forks .6, the crush star .25)
    const reach = reachMax * Math.min(1, Math.max(0.25, (ln.w0 - 0.003) / 0.0048))
    const u0 = R() * 40
    const cum = [0]
    for (let j = 1; j < n; j++) cum.push(cum[j - 1] + dist(P[j], P[j - 1]))
    const total = cum[n - 1] || 1
    const base = pos.length / 3
    for (let j = 0; j < n; j++) {
      const a = P[Math.max(0, j - 1)]
      const b = P[Math.min(n - 1, j + 1)]
      let tx = b[0] - a[0]
      let ty = b[1] - a[1]
      const tl = Math.hypot(tx, ty) || 1
      tx /= tl
      ty /= tl
      let scale = 1
      if (j > 0 && j < n - 1) {
        const sx = P[j + 1][0] - P[j][0]
        const sy = P[j + 1][1] - P[j][1]
        const sl = Math.hypot(sx, sy) || 1
        scale = 1 / Math.max(0.6, Math.abs(tx * (sx / sl) + ty * (sy / sl)))
      }
      const core = ((ln.w0 + (ln.w1 - ln.w0) * (cum[j] / total)) / 2) * widthScale
      const hw = (core * 2.5 + reach) * scale
      const nx = -ty * hw
      const ny = tx * hw
      pos.push(P[j][0] + nx, P[j][1] + ny, z)
      pos.push(P[j][0] - nx, P[j][1] - ny, z)
      mA.push(ln.g[j], -1, ln.k, ln.g[j], 1, ln.k)
      const u = u0 + cum[j]
      cA.push(u, hw, core, reach, u, hw, core, reach)
    }
    for (let j = 0; j < n - 1; j++) {
      const q = base + j * 2
      idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('aM', new THREE.Float32BufferAttribute(mA, 3))
  geo.setAttribute('aC', new THREE.Float32BufferAttribute(cA, 4))
  geo.setIndex(idx)
  geo.computeBoundingSphere()
  return geo
}

export interface WebUniforms {
  [name: string]: THREE.IUniform
  /** the fracture's growth front (g units); < 0 = not struck */
  uGrow: { value: number }
  /** the hot head riding the growth front */
  uHead: { value: number }
  uIntensity: { value: number }
  uColor: { value: THREE.Color }
  uHot: { value: THREE.Color }
  /** the hostile light leaking out along the seams */
  uFlank: { value: THREE.Color }
  uFlankK: { value: number }
  /** the crystal front (g units): frost grows off the seams from the impact outward */
  uCryst: { value: number }
  uCrystColor: { value: THREE.Color }
  /** the re-frost front (shared with the face, VEIL_GLSL) */
  uFront: { value: number }
  uHalf: { value: THREE.Vector2 }
}

/**
 * Crack light and frost crystals. The crack: a razor-thin bright core
 * (coverage-preserving, so it never breaks into dashes far away) with the
 * hostile light glowing out of the seam. The heal: white crystalline fuzz
 * thickens along the seam and fern-like needles grow off both sides, leaning
 * outward the way frost ferns grow. Everything vanishes beneath the
 * condensation front. Drawn in the OPAQUE list (premultiplied, no depth
 * write) after the plate's face.
 */
export function webMaterial(veilGlsl: string, half: THREE.Vector2): { mat: THREE.ShaderMaterial; u: WebUniforms } {
  const u: WebUniforms = {
    uGrow: { value: -1 },
    uHead: { value: 1 },
    uIntensity: { value: 1 },
    uColor: { value: new THREE.Color(1, 1, 1) },
    uHot: { value: new THREE.Color(1, 1, 1) },
    uFlank: { value: new THREE.Color(1, 0.2, 0.2) },
    uFlankK: { value: 0 },
    uCryst: { value: -1 },
    uCrystColor: { value: new THREE.Color(1, 1, 1) },
    uFront: { value: -1 },
    uHalf: { value: half.clone() },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: /* glsl */ `
      attribute vec3 aM;
      attribute vec4 aC;
      varying vec3 vM;
      varying vec4 vC;
      varying vec2 vPane;
      void main() {
        vM = aM; vC = aC;
        vPane = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uGrow, uHead, uIntensity, uFlankK, uCryst, uFront;
      uniform vec3 uColor, uHot, uFlank, uCrystColor;
      uniform vec2 uHalf;
      varying vec3 vM;
      varying vec4 vC;
      varying vec2 vPane;
      ${veilGlsl}
      float sq(float x) { return x * x; }
      void main() {
        // derivatives first, in uniform control flow (never after a discard or inside a branch)
        float a = abs(vM.y) * vC.y;            // distance from the seam (plate units)
        vec2 da = vec2(dFdx(a), dFdy(a));
        vec2 du = vec2(dFdx(vC.x), dFdy(vC.x));
        float fa = max(abs(da.x) + abs(da.y), 1e-5);
        float g = vM.x;
        float d = uGrow - g;
        if (d < 0.0) discard;
        float gone = veilCover(vPane, uFront, uHalf);
        if (gone > 0.999) discard;
        float keep = 1.0 - gone;
        float core = vC.z;
        // razor core, never thinner than ~0.8 px (brightness scaled to keep its coverage)
        float w = max(core, fa * 0.8);
        float coreM = (1.0 - smoothstep(w - fa * 0.5, w + fa * 0.5, a)) * (core / w);
        float head = (1.0 - smoothstep(0.0, 0.06, d)) * uHead;
        vec3 col = (uColor + uHot * head * 1.6) * coreM * uIntensity * vM.z;
        // the hostile light leaking out of the seam
        float fl = a / (core * 3.0 + fa);
        col += uFlank * exp(-fl * fl) * uFlankK * vM.z;
        // frost crystals: a fine white seam, and fern needles off both sides leaning outward
        float cg = clamp((uCryst - g) / 0.22, 0.0, 1.0);
        float alpha = exp(-sq(a / (core * 3.0 + fa))) * 0.35 * vM.z;
        if (cg > 0.0) {
          float L = vC.w * cg;
          // the seam itself turns to a white crystalline band
          float fz = exp(-sq(a / (0.2 * L + core + fa))) * cg;
          float needles = 0.0;
          // two tiers: long primaries, short secondaries between them; each needle a
          // coverage-preserving ~1 px line so it neither vanishes nor aliases
          for (int k = 0; k < 2; k++) {
            float P = k == 0 ? 0.03 : 0.012;
            float m = k == 0 ? 1.1 : 1.5;
            float t = (vC.x + float(k) * 0.37 - a * m) / P;
            float id = floor(t + 0.5);
            vec2 key = vec2(id + float(k) * 91.0, step(0.0, vM.y) * 13.0 + 0.5);
            float hN = vHash(key);
            // irregular: each needle nudged off its slot, some slots empty
            float ctr = id + (vHash(key + 7.3) - 0.5) * 0.5;
            float live = step(k == 0 ? 0.18 : 0.4, vHash(key + 2.9));
            float len = L * (k == 0 ? 0.3 + 0.7 * hN * hN : 0.12 + 0.22 * hN) * live;
            vec2 dt = (du - m * da) / P;
            float ft = max(abs(dt.x) + abs(dt.y), 1e-4);
            float hw = max(0.035, ft * 0.55);
            float nd = (1.0 - smoothstep(hw - ft * 0.5, hw + ft * 0.5, abs(t - ctr))) * (0.035 / hw);
            nd *= 1.0 - smoothstep(len * 0.85, len + fa, a);
            nd *= 1.0 - smoothstep(0.35, 0.8, ft);
            needles += nd * live * (1.0 - 0.45 * clamp(a / max(len, 1e-4), 0.0, 1.0)) * (k == 0 ? 1.0 : 0.75);
          }
          // near the impact everything converges: keep it from blooming into a blot
          float near = 0.35 + 0.65 * smoothstep(0.03, 0.16, g);
          float cr = (fz * 0.5 + min(needles * 2.6, 1.2)) * near;
          col = mix(col, col * 0.7, cg) + uCrystColor * cr;
          alpha += fz * 0.1;
        }
        gl_FragColor = vec4(max(col, vec3(0.0)) * keep, clamp(alpha, 0.0, 1.0) * keep);
      }
    `,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendEquation: THREE.AddEquation,
    transparent: false,
    depthWrite: false,
    toneMapped: false,
  })
  return { mat, u }
}
