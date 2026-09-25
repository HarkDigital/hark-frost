import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

/*
 * Post-processing for Hark Frost: Scene (render + NaN guard) → Bloom →
 * Output → FINAL.
 *
 * Anti-aliasing: the scene renders into its OWN target, the only
 * multisampled one (4x whenever the frame is under ~1.75 device px per CSS px:
 * 1x/1.25x monitors and phones capped at 1.5, so the razor-sharp mark never
 * stair-steps). The composer's ping-pong targets stay single-sampled, so the
 * post passes never pay for MSAA.
 *
 * FINAL is a clean, sharp finish for a black site: no chromatic aberration
 * (the mark must stay razor sharp), a deep vignette, a fine grain and flash /
 * fade, plus:
 *  - FROST (params.frost 0..1): the whole frame behind frosted glass.
 *  - THE BREATH CUT: approaching a chapter boundary, condensation forms on the
 *    screen from its edges inward (a noise-edged frost front); at the boundary
 *    the whole frame is fogged (hiding the swap); after it the fog clears from
 *    the centre outward like breath evaporating off cold glass. uCutSide says
 *    which half. A few tiny clear 'droplet' spots sparkle in the fog.
 *
 * Keep the Post API (params / resetParams / setSize / render / compileAsync /
 * setFadeTone / cutSide) and the uTransition / uFade / uFlash / uGlitch uniforms.
 */

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uDpr: { value: 1 },
    uTransition: { value: 0 },
    uCutSide: { value: 1 },
    uGlitch: { value: 0 },
    uAberration: { value: 0 },
    uGrain: { value: 0.018 },
    uVignette: { value: 0.45 },
    uFlash: { value: 0 },
    uFade: { value: 0 },
    uFrost: { value: 0 },
    uFog: { value: new THREE.Color('#9aa2ad') },
    uFadeColor: { value: new THREE.Color('#000000') },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uDpr, uTransition, uCutSide, uGlitch, uAberration, uGrain, uVignette, uFlash, uFade, uFrost;
    uniform vec2 uResolution;
    uniform vec3 uFog, uFadeColor;
    varying vec2 vUv;

    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.07 + 5.3; a *= 0.5; } return v / 0.875; }

    vec3 frosted(vec2 uv, float radiusPx) {
      vec2 px = 1.0 / uResolution;
      float a0 = hash(gl_FragCoord.xy) * 6.2831853;
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 10; i++) {
        float fi = float(i);
        float r = sqrt((fi + 0.5) / 10.0) * radiusPx;
        float a = a0 + fi * 2.3999632;
        acc += texture2D(tDiffuse, uv + vec2(cos(a), sin(a)) * r * px).rgb;
      }
      return acc / 10.0;
    }

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float gl = clamp(uGlitch, 0.0, 1.0);
      uv.x += gl * 0.003 * sin(uv.y * 60.0 + uTime * 8.0);

      vec3 col;
      if (uAberration > 0.00001) {
        col.r = texture2D(tDiffuse, uv + c * uAberration).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv - c * uAberration).b;
      } else col = texture2D(tDiffuse, uv).rgb;

      float fr = clamp(uFrost, 0.0, 1.0);
      float t = clamp(uTransition, 0.0, 1.0);
      // ---- THE BREATH CUT: a noise-edged fog front
      float fogMask = 0.0;
      if (t >= 0.82) fogMask = 1.0;   // fully fogged: no front to shape
      else if (t > 0.001) {
        float aspect = uResolution.x / max(uResolution.y, 1.0);
        vec2 pc = vec2(c.x * aspect, c.y);
        float r = length(pc) / (0.5 * length(vec2(aspect, 1.0)));   // 0 centre … 1 corners
        float n = fbm(pc * 3.2 + uTime * 0.05) - 0.5;
        float e = t * t * (3.0 - 2.0 * t);
        if (uCutSide < 0.0) fogMask = smoothstep(0.0, 0.08, (r + n * 0.35) - (1.05 - e * 1.25));   // forms from the edges inward
        else fogMask = 1.0 - smoothstep(0.0, 0.08, (1.0 - e) * 1.25 - 0.1 - (r + n * 0.35));       // clears from the centre out
        fogMask = max(fogMask, smoothstep(0.82, 1.0, t));
      }
      float frostK = max(fr, fogMask);
      if (frostK > 0.002) {
        vec3 f = frosted(uv, 30.0 * uDpr * max(fr, fogMask) * 1.2);
        // condensation: lifted, pale, faintly granular
        float grain = hash(floor(gl_FragCoord.xy / (1.6 * uDpr)));
        vec3 fog = f * 0.8 + uFog * (0.07 + 0.05 * grain) * fogMask + 0.02 * fr;
        // a few clear droplets sparkle in the fog: jittered in their cells, each
        // its own size, each appearing on its own threshold as the fog thickens
        vec2 cq = gl_FragCoord.xy / (22.0 * uDpr);
        vec2 cell = floor(cq);
        float h0 = hash(cell), h1 = hash(cell + 17.3), h2 = hash(cell + 41.9);
        vec2 dp = fract(cq) - 0.5 - (vec2(h1, h2) - 0.5) * 0.55;
        float rad = 0.05 + 0.11 * h2;
        float drop = step(0.93, h0) * (1.0 - smoothstep(rad * 0.45, rad, length(dp))) * smoothstep(h1 * 0.6, h1 * 0.6 + 0.3, fogMask);
        fog = mix(fog, col * 1.05 + 0.05, drop * fogMask);
        col = mix(col, fog, smoothstep(0.0, 0.3, frostK));
      }

      col = mix(col, vec3(1.0), clamp(uFlash, 0.0, 1.0));
      float v = 1.0 - smoothstep(0.3, 1.0, length(c * vec2(1.0, 0.9)) * 1.45);
      col *= mix(1.0, 0.4 + 0.6 * v, uVignette);
      col += (hash(vUv * uResolution + fract(uTime * 7.13) * 91.0) - 0.5) * uGrain;
      col = mix(col, uFadeColor, clamp(uFade, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
}

/** minimum seconds between two white-flash onsets (WCAG 2.3.1) */
const FLASH_GAP = 0.4

export type PostParams = {
  bloomStrength: number
  bloomRadius: number
  bloomThreshold: number
  aberration: number
  grain: number
  vignette: number
  /** wobble 0..1 */
  glitch: number
  /** white wash 0..1 */
  flash: number
  exposure: number
  /** whole-frame frosted glass 0..1 */
  frost: number
}

/** Bloom only catches HDR (> ~1.0): emissive lamps, LEDs, speculars. */
export const POST_DEFAULTS: PostParams = {
  // bloom only on true highlights (polished edges, the halo core): never smear the mark
  bloomStrength: 0.35,
  bloomRadius: 0.4,
  bloomThreshold: 1.05,
  aberration: 0,
  grain: 0.018,
  vignette: 0.45,
  glitch: 0,
  flash: 0,
  exposure: 1,
  frost: 0,
}

/**
 * Scrubs NaN/Inf and clamps runaway HDR right after the scene render. A single
 * bad fragment would otherwise smear across the whole frame through bloom.
 */
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 64.0), c.a);
    }
  `,
}

/**
 * Renders the scene into its own target (the only multisampled one) and
 * copies it through the NaN guard into the composer's read buffer.
 */
class ScenePass extends Pass {
  target: THREE.WebGLRenderTarget
  material: THREE.ShaderMaterial
  private quad: FullScreenQuad

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    w: number,
    h: number,
    samples: number,
  ) {
    super()
    this.needsSwap = false
    this.target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples })
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(SanitizeShader.uniforms),
      vertexShader: SanitizeShader.vertexShader,
      fragmentShader: SanitizeShader.fragmentShader,
    })
    this.quad = new FullScreenQuad(this.material)
  }

  setSamples(n: number) {
    if (this.target.samples === n) return
    this.target.samples = n
    this.target.dispose() // re-created with the new sample count on next use
  }

  setSize(w: number, h: number) {
    this.target.setSize(w, h)
  }

  render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(this.target)
    renderer.clear()
    renderer.render(this.scene, this.camera)
    this.material.uniforms.tDiffuse.value = this.target.texture
    renderer.setRenderTarget(read)
    this.quad.render(renderer)
  }

  dispose() {
    this.target.dispose()
    this.material.dispose()
    this.quad.dispose()
  }
}

export class Post {
  composer: EffectComposer
  scenePass: ScenePass
  bloom: UnrealBloomPass
  final: ShaderPass
  /**
   * Chapters write targets here every frame (the engine resets them to
   * defaults first); values are damped so nothing pops at a cut.
   */
  params: PostParams = { ...POST_DEFAULTS }
  private current: PostParams = { ...POST_DEFAULTS }
  transition = 0
  /** -1 while approaching a chapter boundary, +1 after it (engine-driven) */
  cutSide = 1
  fade = 0
  private lastFlashAt = -1e9
  private flashLive = false
  private flashOk = true

  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2())
    // single-sampled ping-pong targets (the composer clones this one)
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType })
    this.composer = new EffectComposer(renderer, rt)
    this.scenePass = new ScenePass(scene, camera, size.x, size.y, Post.samplesFor(renderer.getPixelRatio()))
    this.composer.addPass(this.scenePass)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.45, 0.4, 1.0)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.final = new ShaderPass(FinalShader)
    this.composer.addPass(this.final)
  }

  /** Colour of the reduced-motion fade (black). */
  setCutColor(color: THREE.ColorRepresentation) {
    ;(this.final.uniforms.uFadeColor.value as THREE.Color).set(color)
  }

  /** Engine hook (kept for compatibility; themes may tint the fade by scene tone). */
  setFadeTone(_tone: number) {}

  resetParams() {
    Object.assign(this.params, POST_DEFAULTS)
  }

  /**
   * Compile every post-processing shader in parallel so the first composer
   * render doesn't block on synchronous links.
   */
  compileAsync(): Promise<unknown> {
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const b = this.bloom as unknown as Record<string, unknown>
    const mats: THREE.Material[] = []
    const add = (m: unknown) => {
      if (m && (m as THREE.Material).isMaterial) mats.push(m as THREE.Material)
    }
    for (const pass of this.composer.passes) add((pass as unknown as { material?: unknown }).material)
    for (const m of (b.separableBlurMaterials as unknown[]) ?? []) add(m)
    add(b.compositeMaterial)
    add(b.blendMaterial)
    add(b.materialHighPassFilter)
    add(b.copyMaterial)
    return Promise.all(mats.map(m => this.renderer.compileAsync(new THREE.Mesh(quad.geometry, m), cam).catch(() => {})))
  }

  /** 4x MSAA on the scene render unless the frame is already supersampled */
  static samplesFor(dpr: number) {
    return dpr < 1.75 ? 4 : 0
  }

  setSize(w: number, h: number, dpr: number) {
    this.scenePass.setSamples(Post.samplesFor(dpr))
    this.composer.setPixelRatio(dpr)
    this.composer.setSize(w, h)
    this.bloom.resolution.set((w * dpr) / 2, (h * dpr) / 2)
    this.final.uniforms.uResolution.value.set(w * dpr, h * dpr)
    this.final.uniforms.uDpr.value = dpr
  }

  render(dt: number, time: number) {
    const k = 1 - Math.exp(-6 * dt)
    const c = this.current
    const p = this.params
    for (const key of Object.keys(p) as (keyof PostParams)[]) {
      // flash & glitch respond instantly so chapters can punch them
      c[key] = key === 'flash' || key === 'glitch' ? p[key] : c[key] + (p[key] - c[key]) * k
    }
    // flash budget (WCAG 2.3.1): a flash starting within FLASH_GAP of the last is dropped
    if (c.flash > 0.02) {
      if (!this.flashLive) {
        this.flashLive = true
        this.flashOk = time - this.lastFlashAt >= FLASH_GAP
        if (this.flashOk) this.lastFlashAt = time
      }
      if (!this.flashOk) c.flash = 0
    } else this.flashLive = false
    // a pass that adds nothing costs nothing: chapters set strength 0 where no highlight crosses
    this.bloom.enabled = c.bloomStrength > 0.01
    this.bloom.strength = c.bloomStrength
    this.bloom.radius = c.bloomRadius
    this.bloom.threshold = c.bloomThreshold
    this.renderer.toneMappingExposure = c.exposure
    const u = this.final.uniforms
    u.uTime.value = time
    u.uTransition.value = this.transition
    u.uGlitch.value = c.glitch
    u.uAberration.value = c.aberration
    u.uGrain.value = c.grain
    u.uVignette.value = c.vignette
    u.uFlash.value = c.flash
    u.uFrost.value = c.frost
    u.uCutSide.value = this.cutSide
    u.uFade.value = this.fade
    this.composer.render(dt)
  }
}
