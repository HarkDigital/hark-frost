import * as THREE from 'three'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import { frosted, polished } from '../../kit/glass'
import { logoShapes } from '../../logo/logo'

/*
 * The panes as geometry, and the NEW LAMINATE's glass.
 *
 * slab(): a rounded-rectangle extrusion with a deep, many-segment bevel.
 * ExtrudeGeometry is non-indexed and creased normals keep its groups:
 * group 0 = front/back caps (frosted), group 1 = sides + bevel (polished).
 *
 * laminateMaterials(): kit frosted() glass with a GRADUATED frost in pane
 * space: clear above a thaw front (uFront), sandblasted below it, over a
 * long soft gradient (uSoft). The pane slides in fully frosted; the front
 * then descends like condensation clearing, and stops low — the healed site
 * crisp behind clear glass, diffusing into glowing frost toward the bottom.
 * A small Hark mark is etched into the frost as CLEAR glass (a maker's
 * stamp, the way safety glass is marked). Animate uniforms only.
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
  out.computeBoundingBox()
  out.computeBoundingSphere()
  return out
}

/** A crisp mask of the Hark mark (white on black), for the laminate's stamp. */
function stampTexture(): THREE.CanvasTexture {
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = S
  cv.height = S
  const g = cv.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, S, S)
  g.fillStyle = '#fff'
  // the mark is 1 unit tall, centred, y-up: draw it 0.86 of the tile
  const k = S * 0.86
  g.setTransform(k, 0, 0, -k, S / 2, S / 2)
  g.beginPath()
  for (const shape of logoShapes()) {
    const pts = shape.getPoints(48)
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)))
    g.closePath()
    for (const hole of shape.holes) {
      const hp = hole.getPoints(48)
      hp.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)))
      g.closePath()
    }
  }
  g.fill('evenodd')
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.NoColorSpace
  tex.anisotropy = 4
  return tex
}

export interface LaminateUniforms {
  /** y (pane units) above which the laminate has thawed to clear */
  uFront: { value: number }
  /** half-width of the graduated frost (pane units) */
  uSoft: { value: number }
  uFrost: { value: number }
  uClear: { value: number }
  uStamp: { value: THREE.Texture | null }
  uStampAt: { value: THREE.Vector3 }
  /** sandblasted glass scatters a little light toward the viewer */
  uFrostGlow: { value: THREE.Color }
}

const LOD_RE = /float lod = log2\( transmissionSamplerSize\.x \) \* applyIorToRoughness\( roughness, ior \);\s*return textureBicubic\( transmissionSamplerMap, fragCoord\.xy, lod \);/

export function laminateMaterials(w: number, h: number, depth: number): { caps: THREE.MeshPhysicalMaterial; sides: THREE.MeshPhysicalMaterial; u: LaminateUniforms } {
  const caps = frosted({ frost: 0.5, thickness: depth * 3 }).clone()
  const sides = polished({ thickness: depth * 3 }).clone()
  const u: LaminateUniforms = {
    uFront: { value: h },
    uSoft: { value: 0.4 },
    uFrost: { value: 0.36 },
    uClear: { value: 0.04 },
    uStamp: { value: stampTexture() },
    // centre x, y and height of the stamp (pane units): the bottom-right corner
    uStampAt: { value: new THREE.Vector3(w / 2 - 0.14, -h / 2 + 0.14, 0.13) },
    uFrostGlow: { value: new THREE.Color(0, 0, 0) },
  }
  // where the glass has thawed, read what's behind at full sharpness (three's
  // bicubic read softens even at roughness 0); frosted areas keep the blur
  const chunk = THREE.ShaderChunk.transmission_pars_fragment
  const crisp = LOD_RE.test(chunk)
    ? chunk.replace(
        LOD_RE,
        `float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( max( roughness - 0.07, 0.0 ), ior );
        vec4 sharpT = textureLod( transmissionSamplerMap, fragCoord.xy, 0.0 );
        vec4 softT = textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
        return mix( sharpT, softT, smoothstep( 0.0, 1.2, lod ) );`,
      )
    : null
  if (!crisp && import.meta.env.DEV) console.warn('[shield] transmission chunk changed; the thawed laminate will read slightly soft')
  caps.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPane;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPane = position.xy;')
    let fs = shader.fragmentShader
    if (crisp) fs = fs.replace('#include <transmission_pars_fragment>', crisp)
    shader.fragmentShader = fs
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec2 vPane;
        uniform float uFront, uSoft, uFrost, uClear;
        uniform sampler2D uStamp;
        uniform vec3 uStampAt, uFrostGlow;
        float lamFrost = 1.0;
        float lamMark = 0.0;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        {
          // graduated frost: clear above the thaw front, sandblasted below it
          float thawed = smoothstep(uFront - uSoft, uFront + uSoft, vPane.y);
          float frostK = mix(uFrost, uClear, thawed);
          // the maker's stamp: the Hark mark in CLEAR glass, bottom right
          vec2 st = (vPane - uStampAt.xy) / uStampAt.z + 0.5;
          float inStamp = step(0.0, st.x) * step(st.x, 1.0) * step(0.0, st.y) * step(st.y, 1.0);
          float mark = texture2D(uStamp, clamp(st, 0.0, 1.0)).r * inStamp;
          lamFrost = 1.0 - thawed;
          lamMark = mark * lamFrost;
          roughnessFactor = mix(frostK, uClear, lamMark);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        // sandblast scatters light toward the viewer; the clear stamp doesn't
        totalEmissiveRadiance += uFrostGlow * lamFrost * (1.0 - lamMark * 0.9);`,
      )
  }
  caps.customProgramCacheKey = () => 'frost-shield-laminate'
  return { caps, sides, u }
}

/**
 * Light on a polished edge: drawn with the pane's own geometry, sides group
 * only (the caps' slot gets an invisible material). A thin constant line
 * where the bevel turns (the razor edge), plus a travelling SWEEP band — a
 * studio light gliding along the edge. Additive, after the glass.
 */
export function rimMaterial(): THREE.ShaderMaterial {
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
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec2 vP; varying float vNz;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vP = position.xy;
        vNz = normal.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uBase, uSweep, uWidth, uBand;
      uniform vec2 uDir;
      varying vec3 vN; varying vec3 vV; varying vec2 vP; varying float vNz;
      void main() {
        float nz = abs(vNz);
        // the razor line: where the front bevel turns ~45 degrees
        float rz = (nz - 0.62) / 0.13;
        float razor = exp(-rz * rz);
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float d = dot(vP, normalize(uDir)) - uSweep;
        float band = exp(-d * d / (uWidth * uWidth));
        float c = uBase * razor * (0.35 + 0.65 * f) + uBand * band * (0.5 * razor + 0.5 * f * f);
        gl_FragColor = vec4(uColor * c, 1.0);
      }
    `,
  })
}

/** An invisible stand-in for a group that another mesh draws. */
export const HIDDEN = new THREE.MeshBasicMaterial({ visible: false })
