import * as THREE from 'three'
import { frostedLogo, G, type FrostedLogo } from '../../kit/glass'

/*
 * THAW — the 3D set for the contact chapter.
 *
 *   rig    placed + scaled every frame so the mark sits in the free "art"
 *          area beside (landscape) or above (portrait) the contact panel.
 *          1 rig unit = the mark's height.
 *   turn   the mark's slow turntable (yaw / tilt / float) inside the rig.
 *   logo   the super-sharp frosted Hark mark (kit frostedLogo): a straight-
 *          walled slab with sharp edges (no bevel), translucent frosted caps
 *          and polished walls. Its caps material is patched so the
 *          frost can THAW spatially:
 *            - roughness is mixed per fragment between the sandblast and
 *              clear glass across a noise-edged front that grows from the
 *              mark's centre (uThaw = the front's radius, object units)
 *            - a thin MELT LINE of light rides the front
 *            - the transmission blur is remapped so thawed glass samples
 *              mip 0 (razor-sharp refraction of the neon and the halo) while
 *              the sandblast keeps its soft glow
 *            - the sandblast GATHERS light: real frosted glass scatters light
 *              from a wide cone behind it toward you, so the frosted part
 *              glows brighter than the halo it sits on (uGain) — a backlit
 *              sandblasted sign on black. Thawed glass drops the gain and
 *              shows only what's really behind it: the halo and the neon
 *              tubes, bent by its faces and polished edges.
 *            - THE LAST BREATH: frost re-forms from the mark's outer edges
 *              inward (uFrost = the front's radius; frost wherever the glass
 *              lies outside it): a thin condensation haze runs ahead, then a
 *              finer, feathered crystalline front with a faint rime of light
 *              (uRime). Once it has closed the caps are exactly the landing's
 *              sandblast again, so the site ends on the frosted mark.
 *   slits  the chapter's two NEON tubes (the hero's pair: glacier cyan,
 *          ultraviolet) on a plane behind the mark, placed to cross the mark's
 *          strokes. Behind the sandblast they diffuse into soft bands of
 *          coloured glow; as the glass thaws they snap back into crisp tubes,
 *          broken and displaced where the clear glass bends them. The plane is
 *          re-placed every frame so, seen from the camera, it is centred on
 *          the mark and 1 plane unit = 1 mark height.
 */

export interface ThawUniforms {
  uThaw: { value: number }
  uSoft: { value: number }
  uClear: { value: number }
  uMelt: { value: number }
  uMeltW: { value: number }
  uMeltColor: { value: THREE.Color }
  /** extra light the sandblast gathers from behind (0 = plain transmission) */
  uGain: { value: number }
  /** the re-frost front's radius (object units): glass outside it is frosted again */
  uFrost: { value: number }
  /** how far the condensation haze runs ahead of the re-frost front */
  uHaze: { value: number }
  /** the rime of light riding the re-frost front */
  uRime: { value: number }
}

export interface ThawScene {
  rig: THREE.Group
  turn: THREE.Group
  logo: FrostedLogo
  thaw: ThawUniforms
  slits: THREE.Mesh
  slitU: {
    uStrength: { value: number }
    uX: { value: THREE.Vector3 }
    uK: { value: THREE.Vector3 }
    uColor: { value: THREE.Color }
    uColA: { value: THREE.Color }
    uColB: { value: THREE.Color }
    /** tube radius (plane units = mark heights) and the per-pass strengths (set in onBeforeRender) */
    uR: { value: number }
    uTube: { value: number }
    uHalo: { value: number }
    uSpill: { value: number }
    /** the lines' extent (plane units, y up): top, bottom — they fade out before the chrome bands */
    uSpan: { value: THREE.Vector2 }
    /** a gap cut into the lines (x0, y0, x1, y1): the sign-off sits in it */
    uGap: { value: THREE.Vector4 }
  }
}

/** how far behind the mark the slit plane sits (rig units = mark heights) */
export const SLIT_DEPTH = 1.4

/** the mark's thaw front reaches past its farthest corner at this radius (object units) */
export const THAW_OUTER = 0.66
/** the frost: translucent (not milky), and it spreads the light behind into soft washes (see the lod remap) */
export const FROST = 0.36
/** how much extra light the frost gathers from behind (kept low: translucent, not a lamp) */
export const GAIN = 1.2

const LOD_RE = /float lod = log2\( transmissionSamplerSize\.x \) \* applyIorToRoughness\( roughness, ior \);/

const NOISE = /* glsl */ `
  varying vec3 vThawP;
  uniform float uThaw, uSoft, uClear, uMelt, uMeltW, uGain, uFrost, uHaze, uRime;
  uniform vec3 uMeltColor;
  float thHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float thNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(thHash(i), thHash(i + vec2(1.0, 0.0)), u.x), mix(thHash(i + vec2(0.0, 1.0)), thHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float thFbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * thNoise(p); p = p * 2.03 + 1.7; a *= 0.5; }
    return v;
  }
`

function patchThaw(m: THREE.MeshPhysicalMaterial, u: ThawUniforms) {
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vThawP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvThawP = position;')
    let frag = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE}`)
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        // distance past the thaw front (negative = thawed); a noise-edged,
        // slightly uneven front, like frost melting off cold glass
        float thR = length(vThawP.xy);
        float thD = thR + (thFbm(vThawP.xy * 5.5) - 0.5) * 0.11 - uThaw;
        float thClear = 1.0 - smoothstep(-uSoft, uSoft * 0.25, thD);
        // the last breath: frost re-forms from the edges inward (positive =
        // outside the front = frosted again). A finer, ridged, feathered edge
        // reads as crystals growing, not as the thaw played backwards.
        float frN = thFbm(vThawP.xy * 10.0 + 7.3);
        float frD = thR - uFrost + (abs(frN - 0.5) * 2.0 - 0.5) * 0.07;
        float frIce = smoothstep(-uSoft * 0.25, uSoft, frD);
        float frHaze = smoothstep(-uHaze, 0.0, frD) * (1.0 - frIce);
        thClear *= (1.0 - frIce) * (1.0 - 0.35 * frHaze);
        roughnessFactor = mix(roughnessFactor, uClear, thClear);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        // the melt line: a razor core and a faint wet sheen trailing inside it
        float thM = thD / max(uMeltW, 1e-4);
        float thW = min(thD, 0.0) / max(uMeltW * 5.0, 1e-4);
        totalEmissiveRadiance += uMeltColor * (uMelt * (exp(-thM * thM) + 0.1 * exp(-thW * thW)));
        // the rime: the frost is densest (and glows most) right at its growing
        // edge; a soft, uneven band of light, not a hard line
        float frM = (frD - uMeltW * 1.5) / max(uMeltW * 2.6, 1e-4);
        totalEmissiveRadiance += uMeltColor * (uRime * (0.35 + frN) * exp(-frM * frM));`,
      )
      .replace(
        '#include <transmission_fragment>',
        /* glsl */ `#include <transmission_fragment>
        totalDiffuse *= 1.0 + uGain * (1.0 - thClear);`,
      )
    // thawed glass samples the transmission buffer at mip 0 (razor sharp);
    // the sandblast keeps (almost exactly) three's usual blur
    const chunk = THREE.ShaderChunk.transmission_pars_fragment
    if (LOD_RE.test(chunk)) {
      frag = frag.replace(
        '#include <transmission_pars_fragment>',
        chunk.replace(LOD_RE, 'float lod = log2( transmissionSamplerSize.x ) * max( applyIorToRoughness( roughness, ior ) - 0.075, 0.0 ) * 1.75;'),
      )
    } else if (import.meta.env.DEV) console.warn('[contact] three transmission chunk changed; thawed glass keeps the default blur')
    shader.fragmentShader = frag
  }
  m.customProgramCacheKey = () => 'frost-contact-thaw'
}

const SLIT_VERT = /* glsl */ `
  varying vec2 vP;
  void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
// NEON tubes (x positions uX, strengths uK, colours uColA / uColB / uColor):
// each a capsule from just inside the bottom span to just inside the top one
// (the tubes end, with dim electrode tips, before the chrome bands), split
// into two tubes where the sign-off's gap crosses it. Per pass (uTube, uHalo,
// uSpill): the frame shows the tubes and a tight halo, the glass buffer a
// broad coloured spill the frost diffuses.
const SLIT_FRAG = /* glsl */ `
  uniform vec3 uColor, uColA, uColB, uX, uK;
  uniform float uStrength, uR, uTube, uHalo, uSpill;
  uniform vec2 uSpan;
  uniform vec4 uGap;
  varying vec2 vP;
  float seg(vec2 p, float x, float y0, float y1) {
    if (y1 <= y0) return 1e3; // an empty piece (the gap swallowed it)
    return length(vec2(p.x - x, p.y - clamp(p.y, y0, y1)));
  }
  vec3 tube(vec2 p, float x, vec3 col, float k, float aa) {
    float y1 = uSpan.x * 0.86;
    float y0 = -uSpan.y * 0.86;
    // the sign-off's gap splits the tube in two
    bool split = x > uGap.x && x < uGap.z;
    float d = split ? min(seg(p, x, y0, min(uGap.y, y1)), seg(p, x, max(uGap.w, y0), y1)) : seg(p, x, y0, y1);
    float r = max(uR, aa * 0.75);
    float body = 1.0 - smoothstep(r - aa, r + aa, d);
    float t = clamp(d / r, 0.0, 1.0);
    vec3 gas = mix(vec3(1.0), col, smoothstep(0.05, 0.9, t)) * (1.0 - 0.45 * t * t);
    // electrode tips: the last few percent of each end glows less
    float e = min(y1 - p.y, p.y - y0);
    if (split) e = min(e, max(uGap.y - p.y, p.y - uGap.w));
    float lit = smoothstep(0.0, 0.05, e);
    float halo = exp(-d * d / 0.0018);
    float spill = exp(-d * d / 0.06);
    return k * (gas * body * (0.25 + 0.75 * lit) * uTube + col * (halo * uHalo + spill * uSpill) * mix(0.5, 1.0, lit));
  }
  void main() {
    // one pixel in plane units, from the plane coordinates themselves (a derivative of the
    // capsule distance breaks along the quad's diagonal)
    float aa = max(length(fwidth(vP)) * 0.75, 1e-5);
    vec3 c = tube(vP, uX.x, uColA, uK.x, aa) + tube(vP, uX.y, uColB, uK.y, aa);
    if (uK.z > 0.0) c += tube(vP, uX.z, uColor, uK.z, aa);
    gl_FragColor = vec4(c * uStrength, 1.0);
  }
`

export function buildScene(isFrameTarget: (rt: THREE.WebGLRenderTarget | null) => boolean): ThawScene {
  const rig = new THREE.Group()
  const turn = new THREE.Group()
  rig.add(turn)

  // the mark: a straight-walled slab (no bevel, sharp edges), translucent frosted faces
  const logo = frostedLogo({ depth: 0.23, bevel: 0, frost: FROST })
  logo.caps.envMapIntensity = 1
  logo.sides.envMapIntensity = 2
  turn.add(logo.root)

  const thaw: ThawUniforms = {
    uThaw: { value: -0.2 },
    uSoft: { value: 0.035 },
    uClear: { value: 0.03 },
    uMelt: { value: 0 },
    uMeltW: { value: 0.0055 },
    uMeltColor: { value: new THREE.Color(G.ice) },
    uGain: { value: GAIN },
    uFrost: { value: 2 },
    uHaze: { value: 0.11 },
    uRime: { value: 0 },
  }
  patchThaw(logo.caps, thaw)

  // ---- two neon tubes behind the mark (the hero's pair: glacier cyan, ultraviolet)
  const slitU = {
    uStrength: { value: 0 },
    uX: { value: new THREE.Vector3(-0.23, 0.29, 0.86) },
    uK: { value: new THREE.Vector3(1, 1, 0) },
    uColor: { value: new THREE.Color('#f2f6ff') },
    uColA: { value: new THREE.Color(G.neonA) },
    uColB: { value: new THREE.Color(G.neonB) },
    uR: { value: 0.0075 },
    uTube: { value: 0 },
    uHalo: { value: 0 },
    uSpill: { value: 0 },
    uSpan: { value: new THREE.Vector2(0.8, 0.8) },
    uGap: { value: new THREE.Vector4(0, 9, 0, 9) },
  }
  const slits = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.ShaderMaterial({
      uniforms: slitU,
      vertexShader: SLIT_VERT,
      fragmentShader: SLIT_FRAG,
      // additive light, kept in the OPAQUE list so the glass can refract it
      transparent: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  slits.position.z = -SLIT_DEPTH
  slits.renderOrder = -5
  // the frame: the tubes + a tight halo; the glass buffer: a broad spill for the frost to diffuse
  slits.onBeforeRender = renderer => {
    const rt = renderer.getRenderTarget()
    const main = rt === null || isFrameTarget(rt as THREE.WebGLRenderTarget)
    slitU.uTube.value = 3.2
    slitU.uHalo.value = main ? 0.32 : 0.4
    slitU.uSpill.value = main ? 0.03 : 0.28
    ;(slits.material as THREE.ShaderMaterial).uniformsNeedUpdate = true
  }
  rig.add(slits)

  return { rig, turn, logo, thaw, slits, slitU }
}
