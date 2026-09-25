import * as THREE from 'three'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import { G, frosted, polished } from '../../kit/glass'
import { placeholderTexture } from '../../kit/images'
import type { WorkItem } from '../../content'
import { MONO, SANS, spaced, textPlate, type TextPlate } from './text'

/*
 * The Collection set: a black gallery. Six tall sandblasted glass panels
 * stand in a slow arc (a circle of radius R around C = (0, 0, R), each panel
 * facing C), bottoms just off an unseen black floor. Behind each panel hangs
 * its project's screenshot, and behind that a soft backlight card: through
 * the frost the site reads as a diffuse glow of its own colours. Every
 * panel's faces are frosted (roughness animates: frost ↔ thaw) and its edges
 * are polished (crisp studio highlights). An etched label runs along each
 * panel's foot. Past the last panel, a directory: nine slim frosted bars
 * stacked like a lobby board, each with its name etched at the left and a
 * band of its site hung behind its right half (a glow of colour through the
 * frost) — the selected bar thaws to show that band sharp.
 *
 * Draw order: backlight cards and floor pools are ADDITIVE but OPAQUE (in
 * three's opaque list), so the transmission buffer — which only sees opaque
 * objects — carries them into the frost. Screenshots are opaque too. The
 * crisp "thawed" overlays and etched text are transparent, drawn after glass.
 */

export const R = 11
export const DELTA = 0.215
/** arc angle of featured panel k: panel 0 at the +x end, the row runs toward -x */
export const theta = (k: number) => (2.5 - k) * DELTA
/** arc angle of the directory, past the last panel */
export const STACK_THETA = theta(5) - DELTA * 1.75

export function onArc(th: number, r = R, out = new THREE.Vector3()) {
  return out.set(r * Math.sin(th), 0, R - r * Math.cos(th))
}
/** unit normal toward the arc centre (the way a panel faces) */
export function arcNormal(th: number, out = new THREE.Vector3()) {
  return out.set(-Math.sin(th), 0, Math.cos(th))
}

/* panel (outer, incl. bevel) */
export const PW = 1.52
export const PH = 2.34
const PD = 0.046
const PB = 0.044
export const FRONT = PD / 2 + PB
/** panel centre height (its foot floats just off the floor) */
export const PANEL_Y = 0.1 + PH / 2
/** the screenshot behind the panel (1280x800), set high like a hung print */
export const SW = 1.2
export const SH = SW * 0.625
export const SHOT_Y = 0.38
const SHOT_Z = -FRONT - 0.075

/* directory bars */
export const BAR_W = 2.06
export const BAR_H = 0.17
const BAR_D = 0.03
const BAR_B = 0.014
const BAR_GAP = 0.036
export const BAR_PITCH = BAR_H + BAR_GAP
const BAR_FRONT = BAR_D / 2 + BAR_B
export const STACK_Y = 0.1 + (9 * BAR_PITCH) / 2 + 0.12
export const STACK_H = 9 * BAR_PITCH - BAR_GAP
/** each bar's site band: right half of the bar, inset so it never shows through the gaps */
const BAND_W = 0.84
const BAND_H = 0.112
const BAND_X = BAR_W / 2 - BAND_W / 2 - 0.07
const BAND_Z = -BAR_FRONT - 0.05
/** which horizontal slice of the screenshot the band shows (v from the bottom) */
const BAND_V0 = 0.5

/** City Line Capital (harktest.com) is a pre-launch build: never signal it as live. */
export const isPreview = (url: string) => {
  try {
    return /(^|\.)harktest\.com$/i.test(new URL(url).hostname)
  } catch {
    return false
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/* ---------------------------------------------------------------- glass */

const LOD_RE = /float lod = log2\( transmissionSamplerSize\.x \) \* applyIorToRoughness\( roughness, ior \);\s*return textureBicubic\( transmissionSamplerMap, fragCoord\.xy, lod \);/
let thawChunk: string | null | undefined

/**
 * Transmission that goes fully crisp as the glass thaws: three blurs the
 * transmission sample (bicubic, mip by roughness) even at roughness ~0; this
 * blends to the buffer's mip 0 as the blur level approaches zero, so a thawed
 * pane shows its screenshot sharp while a frosted one still diffuses it.
 */
function thawChunkSource(): string | null {
  if (thawChunk === undefined) {
    const chunk = THREE.ShaderChunk.transmission_pars_fragment
    thawChunk = LOD_RE.test(chunk)
      ? chunk.replace(
          LOD_RE,
          `float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		vec4 crispT = textureLod( transmissionSamplerMap, fragCoord.xy, 0.0 );
		vec4 softT = textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
		return mix( crispT, softT, smoothstep( 0.12, 1.3, lod ) );`,
        )
      : null
    if (!thawChunk && import.meta.env.DEV) console.warn('[work] three transmission chunk changed; thawed glass will blur')
  }
  return thawChunk
}

/** Polished glass: crisp transmission at its low roughness. */
function thawTransmission(m: THREE.MeshPhysicalMaterial) {
  const patched = thawChunkSource()
  if (!patched) return
  m.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <transmission_pars_fragment>', patched)
  }
  m.customProgramCacheKey = () => 'frost-thaw-transmission'
}

/** Per-material uniforms of a thawing frosted face (see frostWindow). */
export interface ThawUniforms {
  /** 0 = sandblasted all over, 1 = the window fully clear */
  uThaw: { value: number }
  /** noise on the thaw front (breath-like when opening, clean when open) */
  uEdge: { value: number }
  /** window centre (xy) and half size (zw), in the slab's local units */
  uWin: { value: THREE.Vector4 }
  uWinR: { value: number }
  uClear: { value: number }
}

/**
 * FROSTED faces that THAW through a window: the material's roughness stays
 * sandblasted (a constant), and a rounded-rect window around the print clears
 * to `uClear` from its centre outward as uThaw runs 0 → 1, with a slightly
 * ragged front like breath evaporating off cold glass. Roughness drives both
 * the transmission blur and the reflections, so the window turns to polished
 * clear glass (sharp site, crisp studio strips) inside a frame that stays
 * frosted and lit. Uniforms only — nothing recompiles as it thaws.
 */
function frostWindow(m: THREE.MeshPhysicalMaterial, win: THREE.Vector4, radius: number): ThawUniforms {
  const u: ThawUniforms = {
    uThaw: { value: 0 },
    uEdge: { value: 1 },
    uWin: { value: win },
    uWinR: { value: radius },
    uClear: { value: 0.025 },
  }
  const patched = thawChunkSource()
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFrostPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvFrostPos = position.xy;')
    let f = shader.fragmentShader
    if (patched) f = f.replace('#include <transmission_pars_fragment>', patched)
    f = f
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vFrostPos;
uniform float uThaw, uEdge, uWinR, uClear;
uniform vec4 uWin;
float frostHash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float frostNoise( vec2 p ) {
	vec2 i = floor( p ), f = fract( p );
	vec2 w = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( frostHash( i ), frostHash( i + vec2( 1.0, 0.0 ) ), w.x ), mix( frostHash( i + vec2( 0.0, 1.0 ) ), frostHash( i + vec2( 1.0, 1.0 ) ), w.x ), w.y ) - 0.5;
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness;
	float frostFront = 0.0;
	{
		float openK = uThaw * ( 2.0 - uThaw );
		vec2 q = abs( vFrostPos - uWin.xy ) - uWin.zw * openK;
		float d = length( max( q, 0.0 ) ) + min( max( q.x, q.y ), 0.0 ) - uWinR * openK - 0.04 * ( 1.0 - openK );
		// a fine, shallow front: crystalline, never a torn smoky rim
		float n = frostNoise( vFrostPos * 22.0 ) * 0.026 + frostNoise( vFrostPos * 70.0 ) * 0.008;
		float e = d + n * uEdge;
		float on = smoothstep( 0.0, 0.06, uThaw );
		float clearM = 1.0 - smoothstep( -0.012, 0.012, e );
		roughnessFactor = mix( roughness, uClear, clearM * on );
		// the melting front: a pale rim of frost crystals catching the light
		frostFront = ( smoothstep( -0.014, 0.0, e ) - smoothstep( 0.0, 0.018, e ) ) * on * uEdge;
	}`,
      )
      .replace('#include <opaque_fragment>', 'outgoingLight += vec3( 0.055, 0.057, 0.062 ) * frostFront;\n\t#include <opaque_fragment>')
    shader.fragmentShader = f
  }
  m.customProgramCacheKey = () => 'frost-window-thaw'
  return u
}

/** A rounded rectangle, w x h, centred. */
function roundedRect(w: number, h: number, r: number): THREE.Shape {
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

/**
 * A glass slab w x h (outer, incl. bevel), centred, facing +z, with material
 * groups kept: 0 = front/back caps (frosted), 1 = sides + bevel (polished).
 */
function slabGeometry(w: number, h: number, depth: number, bevel: number, radius: number, segs: number): THREE.BufferGeometry {
  const bs = bevel * 0.85
  const g = new THREE.ExtrudeGeometry(roundedRect(w - 2 * bs, h - 2 * bs, radius), {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bs,
    bevelSegments: segs,
    curveSegments: 8,
    steps: 1,
  })
  g.translate(0, 0, -depth / 2)
  // non-indexed: creased normals come back on the same geometry, groups intact
  const out = toCreasedNormals(g, Math.PI / 5)
  out.computeBoundingBox()
  out.computeBoundingSphere()
  return out
}

/* ---------------------------------------------------------------- light */

/**
 * Soft additive backlight card (opaque, so the transmission buffer carries it
 * into the frost). Sized to sit hidden behind its glass: the frost glows
 * brightest behind the print and falls away to black at the panel's rim.
 */
function glowMaterial(
  color: THREE.ColorRepresentation,
  strength: number,
  falloff: [number, number],
  center: [number, number] = [0.5, 0.5],
  hole = new THREE.Vector4(0.5, 0.5, 0, 0),
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uStrength: { value: strength },
      uFall: { value: new THREE.Vector2(...falloff) },
      uCenter: { value: new THREE.Vector2(...center) },
      /** a dark window (uv centre, half size) behind a thawed pane: 0..1 */
      uHoleRect: { value: hole },
      uHole: { value: 0 },
    },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uStrength, uHole; uniform vec2 uFall, uCenter; uniform vec4 uHoleRect; varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        vec2 q = (vUv - uCenter) * 2.0 * uFall;
        float r2 = dot(q, q);
        float g = exp(-r2 * 2.4) * 0.75 + exp(-r2 * 9.0) * 0.4;
        g *= 1.0 - smoothstep(0.78, 1.0, max(abs(p.x), abs(p.y)));
        vec2 h = abs(vUv - uHoleRect.xy) - uHoleRect.zw;
        g *= 1.0 - uHole * (1.0 - smoothstep(-0.03, 0.03, max(h.x, h.y)));
        gl_FragColor = vec4(uColor * g * uStrength, 1.0);
      }
    `,
  })
}

/**
 * The Collection's own studio reflections (an HDR equirect built in code,
 * prefiltered once): black, with two tall softboxes, a hairline overhead
 * strip, horizon / low rings that give every bevel a standing line (open
 * toward the viewer, so clear faces stay clean), and a thin diagonal slash that — as world.params.envTurn turns the
 * room — rides up and down the panels' vertical bevels. Every strip has a
 * soft (gaussian) cross-profile a few texels wide, so a highlight on a
 * polished bevel is a clean continuous line, never a dashed one; a very
 * faint broad glow toward the viewer gives the sandblasted faces their satin
 * sheen. Azimuth a = atan2(z, x) (three's equirect convention): +z is 90°.
 */
export async function studioEnv(renderer: THREE.WebGLRenderer, pause: () => Promise<void>): Promise<THREE.Texture> {
  const W = 1024
  const H = 512
  const data = new Uint16Array(W * H * 4)
  const toHalf = THREE.DataUtils.toHalfFloat
  const D = Math.PI / 180
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
  const band = (x: number, s: number) => Math.exp((-x * x) / (2 * s * s))
  const win = (x: number, a: number, b: number, soft: number) => {
    const t0 = Math.min(1, Math.max(0, (x - a) / soft + 0.5))
    const t1 = Math.min(1, Math.max(0, (b - x) / soft + 0.5))
    return t0 * t0 * (3 - 2 * t0) * (t1 * t1 * (3 - 2 * t1))
  }
  // the diagonal slash: a great-ish arc from (a0, l0) to (a1, l1), sampled as a line in (a, lat)
  const s0 = [128 * D, -26 * D]
  const s1 = [158 * D, 34 * D]
  const sdx = s1[0] - s0[0]
  const sdy = s1[1] - s0[1]
  const slen2 = sdx * sdx + sdy * sdy
  for (let y = 0; y < H; y++) {
    // a few rows per slice: never one long task
    if (y > 0 && y % 96 === 0) await pause()
    const lat = ((y + 0.5) / H - 0.5) * Math.PI
    const cl = Math.cos(lat)
    for (let x = 0; x < W; x++) {
      const a = ((x + 0.5) / W - 0.5) * 2 * Math.PI
      let v = 0
      // key softbox, front-left (reads on the left bevels)
      v += 7 * band(wrap(a - 150 * D) * cl, 1.1 * D) * win(lat, -42 * D, 58 * D, 6 * D)
      // fill softbox, front-right (right bevels)
      v += 3.2 * band(wrap(a - 28 * D) * cl, 0.9 * D) * win(lat, -38 * D, 52 * D, 6 * D)
      // hairline overhead strip (top edges)
      v += 5 * band(lat - 61 * D, 0.7 * D) * win(a, 25 * D, 155 * D, 10 * D)
      // a horizon ring and a low ring, open toward the viewer so a clear face
      // never mirrors them: every vertical / bottom bevel always holds a line
      {
        const away = 1 - band(wrap(a - 90 * D), 30 * D)
        v += 2.4 * band(lat - 2 * D, 0.8 * D) * away
        v += 1.2 * band(lat + 48 * D, 1.2 * D) * away
        // a broad soft sky for the top bevels
        v += 0.5 * win(lat, 44 * D, 80 * D, 12 * D) * away
      }
      // the slash
      {
        const px = wrap(a - s0[0])
        const py = lat - s0[1]
        const t = Math.min(1, Math.max(0, (px * sdx + py * sdy) / slen2))
        const ex = (px - t * sdx) * cl
        const ey = py - t * sdy
        v += 6 * band(Math.sqrt(ex * ex + ey * ey), 0.6 * D) * win(t, 0.02, 0.98, 0.08)
      }
      // a faint broad glow toward the viewer: satin sheen on sandblasted faces
      {
        const da = wrap(a - 90 * D) * cl
        const dl = lat - 12 * D
        v += 0.09 * Math.exp(-(da * da + dl * dl) / (2 * (34 * D) ** 2))
      }
      const i = (y * W + x) * 4
      const hv = toHalf(v)
      data[i] = hv
      data[i + 1] = hv
      data[i + 2] = toHalf(v * 1.02)
      data[i + 3] = toHalf(1)
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.LinearSRGBColorSpace
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  const pmrem = new THREE.PMREMGenerator(renderer)
  const rt = pmrem.fromEquirectangular(tex)
  pmrem.dispose()
  tex.dispose()
  return rt.texture
}

export interface Panel {
  /** on the arc, facing C */
  station: THREE.Group
  /** the panel's own pose (yaw / push toward the viewer) */
  pivot: THREE.Group
  mesh: THREE.Mesh
  caps: THREE.MeshPhysicalMaterial
  /** the window thaw (uniforms on caps) */
  thaw: ThawUniforms
  sides: THREE.MeshPhysicalMaterial
  shot: THREE.Mesh
  shotMat: THREE.MeshBasicMaterial
  /** the crisp thawed copy of the screenshot (drawn over the glass) */
  crisp: THREE.Mesh
  crispMat: THREE.MeshBasicMaterial
  back: THREE.Mesh
  backMat: THREE.ShaderMaterial
  pool: THREE.Mesh
  poolMat: THREE.ShaderMaterial
  label: TextPlate
  /** the screenshot's average colour (the glow it throws on the floor) */
  tint: THREE.Color
}

export interface Bar {
  root: THREE.Group
  mesh: THREE.Mesh
  caps: THREE.MeshPhysicalMaterial
  thaw: ThawUniforms
  label: TextPlate
  /** its site's band behind the right half (opaque: diffused by the frost) */
  bandMat: THREE.MeshBasicMaterial
  /** the crisp copy of the band, drawn over the glass as it thaws */
  crispMat: THREE.MeshBasicMaterial
}

export interface Gallery {
  root: THREE.Group
  panels: Panel[]
  stack: THREE.Group
  bars: Bar[]
  sides: THREE.MeshPhysicalMaterial
  stackBackMat: THREE.ShaderMaterial
  stackPoolMat: THREE.ShaderMaterial
  /** every glass material (for envMap / rotation sync) */
  glass: THREE.MeshPhysicalMaterial[]
}

/** Average colour of a canvas texture (the glow a screenshot throws through frost). */
export function averageColor(tex: THREE.Texture, out: THREE.Color): THREE.Color {
  const img = tex.image as CanvasImageSource | undefined
  if (!img) return out
  try {
    const c = document.createElement('canvas')
    c.width = c.height = 4
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0, 4, 4)
    const d = g.getImageData(0, 0, 4, 4).data
    let r = 0
    let gg = 0
    let b = 0
    for (let i = 0; i < d.length; i += 4) {
      r += d[i]
      gg += d[i + 1]
      b += d[i + 2]
    }
    const n = d.length / 4
    out.setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace)
  } catch {
    /* tainted or missing: keep the old colour */
  }
  return out
}

export function buildGallery(featured: WorkItem[], rest: WorkItem[], mobile: boolean, frost: number): Gallery {
  const root = new THREE.Group()
  root.name = 'collection'
  const glassMats: THREE.MeshPhysicalMaterial[] = []

  // thin panes: a small optical thickness keeps the thawed print aligned with its crisp copy
  const capsBase = frosted({ frost, thickness: 0.05, env: 0.4 })
  const sidesBase = polished({ thickness: 0.05 })

  // ---------------------------------------------------------------- panels
  const panelGeo = slabGeometry(PW, PH, PD, PB, 0.03, mobile ? 5 : 8)
  const shotGeo = new THREE.PlaneGeometry(SW, SH)
  const backGeo = new THREE.PlaneGeometry(PW * 0.96, PH * 0.96)
  const poolGeo = new THREE.PlaneGeometry(1, 1)
  // the backlight's hot spot sits behind the print
  const backCenter: [number, number] = [0.5, 0.5 + (SHOT_Y - 0.12) / (PH * 0.96)]
  // the thaw window: the print plus a narrow clear mat
  const WIN_PAD = 0.055
  const win = new THREE.Vector4(0, SHOT_Y, SW / 2 + WIN_PAD, SH / 2 + WIN_PAD)
  const hole = new THREE.Vector4(0.5, 0.5 + SHOT_Y / (PH * 0.96), (SW / 2 + WIN_PAD * 0.6) / (PW * 0.96), (SH / 2 + WIN_PAD * 0.6) / (PH * 0.96))

  const panels: Panel[] = featured.map((w, k) => {
    const th = theta(k)
    const station = new THREE.Group()
    onArc(th, R, station.position)
    station.rotation.y = -th
    root.add(station)
    const pivot = new THREE.Group()
    pivot.position.y = PANEL_Y
    station.add(pivot)

    const caps = capsBase.clone()
    const sides = sidesBase.clone()
    const thaw = frostWindow(caps, win, 0.03)
    thawTransmission(sides)
    glassMats.push(caps, sides)
    const mesh = new THREE.Mesh(panelGeo, [caps, sides])
    pivot.add(mesh)

    const placeholder = placeholderTexture('#15171c')
    const shotMat = new THREE.MeshBasicMaterial({ map: placeholder, toneMapped: true })
    shotMat.color.setScalar(0.5)
    const shot = new THREE.Mesh(shotGeo, shotMat)
    shot.position.set(0, SHOT_Y, SHOT_Z)
    pivot.add(shot)

    const crispMat = new THREE.MeshBasicMaterial({
      map: placeholder,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: true,
    })
    crispMat.color.setScalar(0.88)
    const crisp = new THREE.Mesh(shotGeo, crispMat)
    crisp.position.copy(shot.position)
    crisp.scale.setScalar(1.004)
    crisp.renderOrder = 6
    pivot.add(crisp)

    const backMat = glowMaterial(G.ice, 0.2, [1.05, 1.25], backCenter, hole)
    const back = new THREE.Mesh(backGeo, backMat)
    back.position.set(0, 0, SHOT_Z - 0.05)
    back.renderOrder = -5
    pivot.add(back)

    // light spilling through the frost onto the black floor
    const poolMat = glowMaterial(G.ice, 0.1, [1, 1])
    const pool = new THREE.Mesh(poolGeo, poolMat)
    pool.rotation.x = -Math.PI / 2
    pool.scale.set(PW * 1.7, 1.1, 1)
    pool.position.set(0, 0.001, 0.26)
    pool.renderOrder = -5
    station.add(pool)

    // the etched label along the foot: number + name (+ PREVIEW for a pre-launch build)
    const pre = isPreview(w.url)
    const label = textPlate(1600, 72, PW - 0.26, (g, pw, ph) => {
      g.font = `400 30px ${MONO}`
      g.globalAlpha = 0.55
      const nw = spaced(g, `${pad(k + 1)}`, 2, ph / 2, 4)
      g.globalAlpha = 0.95
      const x = nw + 34
      const tw = spaced(g, w.name.toUpperCase(), x, ph / 2, 6)
      if (pre) {
        g.globalAlpha = 0.55
        spaced(g, '· PREVIEW', x + tw + 22, ph / 2, 6)
      }
      void pw
    })
    label.mesh.position.set(0, -PH / 2 + 0.17, FRONT + 0.0025)
    pivot.add(label.mesh)

    return { station, pivot, mesh, caps, thaw, sides, shot, shotMat, crisp, crispMat, back, backMat, pool, poolMat, label, tint: new THREE.Color(0.5, 0.5, 0.55) }
  })

  // ---------------------------------------------------------------- directory
  const stack = new THREE.Group()
  onArc(STACK_THETA, R, stack.position)
  stack.rotation.y = -STACK_THETA
  root.add(stack)

  const barGeo = slabGeometry(BAR_W, BAR_H, BAR_D, BAR_B, 0.02, mobile ? 3 : 5)
  const sides = sidesBase.clone()
  thawTransmission(sides)
  glassMats.push(sides)

  // a horizontal band of the site (the hero, below the nav), full width
  const bandGeo = new THREE.PlaneGeometry(BAND_W, BAND_H)
  {
    const uv = bandGeo.attributes.uv
    const vSpan = (BAND_H / BAND_W) * 1.6
    for (let i = 0; i < uv.count; i++) uv.setY(i, BAND_V0 + uv.getY(i) * vSpan)
    uv.needsUpdate = true
  }

  const barWin = new THREE.Vector4(BAND_X, 0, BAND_W / 2 + 0.018, BAND_H / 2 + 0.012)
  const stackBackMat = glowMaterial(G.ice, 0.16, [0.95, 1.0], [0.5, 0.5])
  const stackBack = new THREE.Mesh(new THREE.PlaneGeometry(BAR_W * 0.98, STACK_H * 0.99), stackBackMat)
  stackBack.position.set(0, STACK_Y, BAND_Z - 0.05)
  stackBack.renderOrder = -5
  stack.add(stackBack)
  const stackPoolMat = glowMaterial(G.ice, 0.08, [1, 1])
  const stackPool = new THREE.Mesh(poolGeo, stackPoolMat)
  stackPool.rotation.x = -Math.PI / 2
  stackPool.scale.set(BAR_W * 1.6, 1.0, 1)
  stackPool.position.set(0, 0.001, 0.26)
  stackPool.renderOrder = -5
  stack.add(stackPool)

  const bars: Bar[] = rest.map((w, j) => {
    const root = new THREE.Group()
    root.position.set(0, STACK_Y + (4 - j) * BAR_PITCH, 0)
    stack.add(root)
    const caps = capsBase.clone()
    const thaw = frostWindow(caps, barWin, 0.012)
    glassMats.push(caps)
    const mesh = new THREE.Mesh(barGeo, [caps, sides])
    root.add(mesh)

    const placeholder = placeholderTexture('#15171c')
    const bandMat = new THREE.MeshBasicMaterial({ map: placeholder, toneMapped: true })
    bandMat.color.setScalar(0.5)
    const band = new THREE.Mesh(bandGeo, bandMat)
    band.position.set(BAND_X, 0, BAND_Z)
    root.add(band)
    const crispMat = new THREE.MeshBasicMaterial({
      map: placeholder,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: true,
    })
    crispMat.color.setScalar(0.88)
    const crisp = new THREE.Mesh(bandGeo, crispMat)
    crisp.position.copy(band.position)
    crisp.renderOrder = 6
    root.add(crisp)

    const n = featured.length + j + 1
    const plateW = BAR_W - BAND_W - 0.19
    const label = textPlate(1280, 128, plateW, (g, pw, ph) => {
      g.font = `400 40px ${MONO}`
      g.globalAlpha = 0.6
      const nw = spaced(g, pad(n), 2, ph / 2 + 2, 3)
      g.globalAlpha = 1
      g.font = `520 60px ${SANS}`
      const x = nw + 34
      const full = g.measureText(w.name).width
      const room = pw - x - 6
      // squeeze a long name into the plate rather than clip it
      if (full > room) {
        g.save()
        g.translate(x, 0)
        g.scale(room / full, 1)
        g.fillText(w.name, 0, ph / 2)
        g.restore()
      } else g.fillText(w.name, x, ph / 2)
    })
    label.mesh.position.set(-BAR_W / 2 + 0.075 + plateW / 2, 0, BAR_FRONT + 0.0022)
    root.add(label.mesh)
    return { root, mesh, caps, thaw, label, bandMat, crispMat }
  })

  return {
    root,
    panels,
    stack,
    bars,
    sides,
    stackBackMat,
    stackPoolMat,
    glass: glassMats,
  }
}
