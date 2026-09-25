import * as THREE from 'three'
import { frostedLogo, G, type FrostedLogo } from '../../kit/glass'

/*
 * THAW — the 3D set for the contact chapter.
 *
 *   rig    placed + scaled every frame so the mark sits in the free "art"
 *          area beside (landscape) or above (portrait) the contact panel.
 *          1 rig unit = the mark's height.
 *   turn   the mark's slow turntable (yaw / tilt / float) inside the rig.
 *   logo   the super-sharp frosted Hark mark (kit frostedLogo): sandblasted
 *          caps, a deep polished bevel. Its caps material is patched so the
 *          frost can THAW spatially:
 *            - roughness is mixed per fragment between the sandblast and
 *              clear glass across a noise-edged front that grows from the
 *              mark's centre (uThaw = the front's radius, object units)
 *            - a thin MELT LINE of light rides the front
 *            - the transmission blur is remapped so thawed glass samples
 *              mip 0 (razor-sharp refraction of the slits and the halo) while
 *              the sandblast keeps its soft glow
 *            - the sandblast GATHERS light: real frosted glass scatters light
 *              from a wide cone behind it toward you, so the frosted part
 *              glows brighter than the halo it sits on (uGain) — a backlit
 *              sandblasted sign on black. Thawed glass drops the gain and
 *              shows only what's really behind it: the halo and the hairline
 *              slits, bent by its faces and polished edges.
 *            - THE LAST BREATH: frost re-forms from the mark's outer edges
 *              inward (uFrost = the front's radius; frost wherever the glass
 *              lies outside it): a thin condensation haze runs ahead, then a
 *              finer, feathered crystalline front with a faint rime of light
 *              (uRime). Once it has closed the caps are exactly the landing's
 *              sandblast again, so the site ends on the frosted mark.
 *   slits  the chapter's own hairline light lines on a plane behind the mark
 *          (the world's slits are fixed around the halo; these are placed to
 *          cross the mark's strokes). Behind the sandblast they diffuse into
 *          soft bands of glow; as the glass thaws they snap back into razor
 *          lines, broken and displaced where the clear glass bends them.
 *          The plane is re-placed every frame so, seen from the camera, it is
 *          centred on the mark and 1 plane unit = 1 mark height.
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
        chunk.replace(LOD_RE, 'float lod = log2( transmissionSamplerSize.x ) * max( applyIorToRoughness( roughness, ior ) - 0.075, 0.0 ) * 1.12;'),
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
// three razor lines (x positions uX, strengths uK), ~1px at any scale,
// fading out toward the chrome bands, with a gap for the sign-off
const SLIT_FRAG = /* glsl */ `
  uniform vec3 uColor, uX, uK;
  uniform float uStrength;
  uniform vec2 uSpan;
  uniform vec4 uGap;
  varying vec2 vP;
  float hair(float x, float c, float px) { float d = (x - c) / px; return exp(-d * d * 1.6); }
  void main() {
    float px = max(fwidth(vP.x), 1e-5);
    float l = uK.x * hair(vP.x, uX.x, px) + uK.y * hair(vP.x, uX.y, px) + uK.z * hair(vP.x, uX.z, px);
    float top = 1.0 - smoothstep(uSpan.x * 0.45, uSpan.x, vP.y);
    float bot = 1.0 - smoothstep(uSpan.y * 0.45, uSpan.y, -vP.y);
    float soft = 0.02;
    float gx = smoothstep(uGap.x - soft, uGap.x, vP.x) * (1.0 - smoothstep(uGap.z, uGap.z + soft, vP.x));
    float gy = smoothstep(uGap.y - soft, uGap.y, vP.y) * (1.0 - smoothstep(uGap.w, uGap.w + soft, vP.y));
    gl_FragColor = vec4(uColor * (l * top * bot * (1.0 - gx * gy) * uStrength), 1.0);
  }
`

export function buildScene(): ThawScene {
  const rig = new THREE.Group()
  const turn = new THREE.Group()
  rig.add(turn)

  // the mark: deep polished bevel, sandblasted caps
  const logo = frostedLogo({ depth: 0.18, bevel: 0.026, frost: 0.46 })
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
    uGain: { value: 2.3 },
    uFrost: { value: 2 },
    uHaze: { value: 0.11 },
    uRime: { value: 0 },
  }
  patchThaw(logo.caps, thaw)

  // ---- hairline slits behind the mark
  const slitU = {
    uStrength: { value: 0 },
    uX: { value: new THREE.Vector3(-0.21, 0.27, 0.86) },
    uK: { value: new THREE.Vector3(1, 0.75, 0.4) },
    uColor: { value: new THREE.Color('#f2f6ff') },
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
  rig.add(slits)

  return { rig, turn, logo, thaw, slits, slitU }
}
