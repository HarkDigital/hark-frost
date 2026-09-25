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
 * 0..~1.05): the fracture is grown by scroll (visible where g < uGrow) and
 * healed from the edges inward (visible where g < uHeal).
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
 * Ribbons along the crack lines: thin quads with mitred joints, lying flat at
 * `z`. Attributes: aG (growth time), aS (-1..1 across the ribbon), aK (weight).
 */
export function webGeometry(lines: CrackLine[], z: number, widthScale = 1): THREE.BufferGeometry {
  const pos: number[] = []
  const gA: number[] = []
  const sA: number[] = []
  const kA: number[] = []
  const idx: number[] = []
  for (const ln of lines) {
    const P = ln.pts
    const n = P.length
    if (n < 2) continue
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
      const hw = ((ln.w0 + (ln.w1 - ln.w0) * (cum[j] / total)) / 2) * scale * widthScale
      const nx = -ty * hw
      const ny = tx * hw
      pos.push(P[j][0] + nx, P[j][1] + ny, z)
      pos.push(P[j][0] - nx, P[j][1] - ny, z)
      gA.push(ln.g[j], ln.g[j])
      sA.push(-1, 1)
      kA.push(ln.k, ln.k)
    }
    for (let j = 0; j < n - 1; j++) {
      const q = base + j * 2
      idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('aG', new THREE.Float32BufferAttribute(gA, 1))
  geo.setAttribute('aS', new THREE.Float32BufferAttribute(sA, 1))
  geo.setAttribute('aK', new THREE.Float32BufferAttribute(kA, 1))
  geo.setIndex(idx)
  geo.computeBoundingSphere()
  return geo
}

/**
 * Crack light: a razor-thin bright core. Visible where aG < uGrow (growth)
 * and aG < uHeal (healing retracts from the edges inward); a hotter head rides
 * the growth front. Drawn in the OPAQUE list (premultiplied, no depth write)
 * after the pane's face, so the laminate that later slides in front sees it.
 */
export function webMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uGrow: { value: 0 },
      uHeal: { value: 2 },
      uIntensity: { value: 1 },
      uColor: { value: new THREE.Color(1, 1, 1) },
      uHot: { value: new THREE.Color(1, 1, 1) },
      uHead: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float aG;
      attribute float aS;
      attribute float aK;
      varying float vG;
      varying float vS;
      varying float vK;
      void main() {
        vG = aG; vS = aS; vK = aK;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uGrow, uHeal, uIntensity, uHead;
      uniform vec3 uColor, uHot;
      varying float vG;
      varying float vS;
      varying float vK;
      void main() {
        float d = uGrow - vG;
        float h = uHeal - vG;
        if (d < 0.0 || h < 0.0) discard;
        // lines dim as the heal front reaches them
        float healK = smoothstep(0.0, 0.12, h);
        float head = (1.0 - smoothstep(0.0, 0.06, d)) * uHead;
        float s = abs(vS);
        float core = 1.0 - smoothstep(0.25, 1.0, s);
        vec3 c = (uColor + uHot * head * 1.6) * core * uIntensity * vK * healK;
        // premultiplied: a faint darkening at the flanks (the break interrupts the frost's glow)
        float a = (1.0 - s * s) * 0.35 * healK * vK;
        gl_FragColor = vec4(c, a);
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
}
