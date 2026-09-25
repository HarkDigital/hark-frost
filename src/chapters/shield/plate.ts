import * as THREE from 'three'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import { flattenCaps, smoothSides } from '../../kit/glass'

/*
 * The plate as geometry, and the light on its polished edge.
 *
 * slab(): a rounded-rectangle extrusion with a deep, many-segment bevel.
 * ExtrudeGeometry is non-indexed and creased normals keep its groups:
 * group 0 = front/back caps (the sandblasted face), group 1 = sides + bevel
 * (polished). The kit's smoothSides / flattenCaps clean the normals so the
 * studio strips run as one unbroken line along the bevel in close-up.
 *
 * rimMaterial(): the polished edge drawn a second time, additively: a razor
 * line where the bevel turns, a travelling sweep (a studio light gliding
 * along the edge), and the LAMINATE's interlayer — a hairline at
 * mid-thickness around the plate's side, the film that holds a broken plate
 * together. Animate uniforms only.
 */

export function roundedRect(w: number, h: number, r: number): THREE.Shape {
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

export function slab(w: number, h: number, o: { radius: number; depth: number; bevel: number; segments: number }): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(roundedRect(w - o.bevel * 1.6, h - o.bevel * 1.6, Math.max(0.01, o.radius - o.bevel * 0.8)), {
    depth: o.depth,
    bevelEnabled: true,
    bevelThickness: o.bevel,
    bevelSize: o.bevel * 0.8,
    bevelSegments: o.segments,
    curveSegments: 14,
    steps: 1,
  })
  geo.translate(0, 0, -o.depth / 2)
  const out = toCreasedNormals(geo, Math.PI / 4.5)
  geo.dispose()
  smoothSides(out)
  flattenCaps(out)
  out.computeBoundingBox()
  out.computeBoundingSphere()
  return out
}

/**
 * Light on a polished edge: drawn with the plate's own geometry, sides group
 * only (the caps' slot gets an invisible material). Additive, after the glass.
 */
export function rimMaterial(halfDepth: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uColor: { value: new THREE.Color(1, 1, 1) },
      uBase: { value: 0.25 },
      uSweep: { value: -9 },
      uWidth: { value: 0.5 },
      uBand: { value: 0 },
      uDir: { value: new THREE.Vector2(1, 0.35) },
      /** the laminate's interlayer: a hairline at mid-thickness */
      uFilm: { value: 0.3 },
      uFilmColor: { value: new THREE.Color(1, 1, 1) },
      uHalfDepth: { value: halfDepth },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vNz;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vP = position;
        vNz = normal.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor, uFilmColor;
      uniform float uBase, uSweep, uWidth, uBand, uFilm, uHalfDepth;
      uniform vec2 uDir;
      varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vNz;
      void main() {
        float nz = abs(vNz);
        // the razor line: where the front bevel turns ~45 degrees
        float rz = (nz - 0.62) / 0.13;
        float razor = exp(-rz * rz);
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float d = dot(vP.xy, normalize(uDir)) - uSweep;
        float band = exp(-d * d / (uWidth * uWidth));
        float c = uBase * razor * (0.35 + 0.65 * f) + uBand * band * (0.5 * razor + 0.5 * f * f);
        // the interlayer: only on the flat side wall, a crisp line at z = 0
        float side = 1.0 - smoothstep(0.08, 0.3, nz);
        float z = vP.z / uHalfDepth;
        float fw = max(fwidth(z), 1e-4);
        float film = (1.0 - smoothstep(0.05, 0.05 + fw * 1.5, abs(z))) * side;
        vec3 col = uColor * c + uFilmColor * film * uFilm;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
}

/** An invisible stand-in for a group that another mesh draws. */
export const HIDDEN = new THREE.MeshBasicMaterial({ visible: false })
