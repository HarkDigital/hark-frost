import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import type { Frame } from '../core/types'
import { World } from '../world/World'
import { G, neonTube, type NeonTube } from '../kit/glass'
import { buildDeck, TILE_H, TILE_W } from '../chapters/services/deck'

/*
 * The service page's hero art: the service's own etched plate from the
 * Services chapter (the same glass, the same etching), alone in the black
 * studio, backlit by its softbox and standing between the two neon tubes the
 * frost tints cyan and violet. It turns a little in the light, and the etched
 * lines catch one light sweep as the page opens.
 *
 * A small standalone renderer (no scroll engine): scene → bloom → output,
 * drawn only while the hero is on screen and the tab is visible. Reduced
 * motion: no sway, no sweep, the neon fades up instead of striking.
 */

export interface HeroHandle {
  dispose(): void
}

/** where the plate sits: centre (NDC) and how much of the frame it may fill */
const FIT = {
  land: { sx: 0.44, sy: 0.04, hf: 0.5, wf: 0.4 },
  port: { sx: 0, sy: 0.36, hf: 0.3, wf: 0.74 },
}
const FOV = 30
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
/** the studio's rest angle (the Services chapter's) */
const ENV_REST = 1.8

export function mountHero(canvas: HTMLCanvasElement, index: number, o: { reduced: boolean; mobile: boolean }): HeroHandle {
  const { reduced, mobile } = o
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' })
  renderer.setClearColor(0x000000, 1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1
  const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.75 : 2)
  renderer.setPixelRatio(dpr)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 2000)
  const world = new World(scene, mobile, renderer)
  scene.add(world.object)

  // ---- the plate (the Services chapter's deck; only this service's plate joins the scene)
  const deck = buildDeck(mobile, world.envMap)
  const plate = deck.plates[index]
  const holder = new THREE.Group()
  holder.add(plate.holder)
  plate.holder.position.set(0, 0, 0)
  plate.holder.rotation.set(0, 0, 0)
  scene.add(holder, deck.back)
  plate.caps.roughness = 0.36
  plate.caps.envMapIntensity = 0.85
  plate.sides.envMapIntensity = 4.2
  plate.glowMat.uniforms.uBright.value = 0.24
  const bu = deck.backMat.uniforms
  ;(bu.uHalf.value as THREE.Vector2).set(TILE_W * 0.44, TILE_H * 0.4)
  bu.uSoft.value = 0.2
  bu.uTail.value = 1.3
  bu.uTailAmt.value = 0.05
  ;(bu.uHot.value as THREE.Vector2).set(0.35, 0.45)
  deck.back.position.set(0, 0, -0.95)

  // ---- post: the frame renders into a multisampled HDR target, then bloom + output
  const size = new THREE.Vector2(1, 1)
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: dpr >= 2 ? 2 : 4 })
  const composer = new EffectComposer(renderer, target)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(size, 0.26, 0.3, 1.05)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())
  const isFrame = (rt: THREE.WebGLRenderTarget | null) => rt === null || rt === composer.renderTarget1 || rt === composer.renderTarget2

  // ---- the neon pair, standing behind the plate's edges
  const neon: NeonTube[] = [
    { x: -0.64, z: -1.25, color: G.neonA },
    { x: 0.7, z: -1.45, color: G.neonB },
  ].map(n => {
    const t = neonTube({ color: n.color, length: 40, radius: 0.012, glowRadius: 0.075, spillRadius: 0.42, isFrameTarget: isFrame })
    t.mesh.position.set(n.x, 0, n.z)
    t.k.main.tube = 3.2
    t.k.main.glow = 0.32
    t.k.main.spill = 0.035
    t.k.trans.tube = 3.2
    t.k.trans.glow = 1.1
    t.k.trans.spill = 0.4
    t.on.value = 0
    scene.add(t.mesh)
    return t
  })

  // ---- framing
  let W = 1
  let H = 1
  const fit = { sx: 0, sy: 0, d: 5 }
  const resize = () => {
    const r = canvas.getBoundingClientRect()
    W = Math.max(1, Math.round(r.width))
    H = Math.max(1, Math.round(r.height))
    renderer.setSize(W, H, false)
    composer.setSize(W, H)
    size.set(W, H)
    camera.aspect = W / H
    camera.updateProjectionMatrix()
    const f = W > H * 1.05 ? FIT.land : FIT.port
    fit.sx = f.sx
    fit.sy = f.sy
    fit.d = Math.max(TILE_H / (f.hf * 2 * TAN), TILE_W / (f.wf * 2 * TAN * camera.aspect))
    wake()
  }

  // ---- clocks + pointer
  const start = performance.now()
  let last = start
  let time = 0
  const pointer = new THREE.Vector2()
  const pointerTo = new THREE.Vector2()
  const onPointer = (e: PointerEvent) => {
    pointerTo.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1))
    wake()
  }
  if (!reduced) window.addEventListener('pointermove', onPointer, { passive: true })

  const frame: Frame = {
    time: 0,
    dt: 0,
    progress: 0,
    velocity: 0,
    pointer,
    pointerRaw: pointerTo,
    width: 1,
    height: 1,
    mobile,
    reducedMotion: reduced,
    still: reduced,
  }

  /** a neon tube strikes: one stutter, then it holds (a fade under reduced motion) */
  const strike = (since: number, t0: number) => {
    const x = since - t0
    if (x <= 0) return 0
    if (reduced) return Math.min(1, x / 0.6)
    if (x < 0.06) return 0.75
    if (x < 0.15) return 0.22
    return 0.55 + 0.45 * Math.min(1, (x - 0.15) / 0.4)
  }

  const pos = new THREE.Vector3()
  const tgt = new THREE.Vector3()
  const tmp = new THREE.Vector3()
  let raf = 0
  let visible = true
  let settled = false

  const draw = () => {
    raf = 0
    const now = performance.now()
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const since = (now - start) / 1000
    if (!reduced) time += dt
    pointer.lerp(pointerTo, 1 - Math.exp(-3 * dt))

    // camera: straight on, shifted so the plate sits where the copy leaves room
    const d = fit.d
    const shiftX = -fit.sx * d * TAN * camera.aspect
    const shiftY = -fit.sy * d * TAN
    const px = reduced ? 0 : pointer.x * 0.12
    const py = reduced ? 0 : pointer.y * 0.08
    pos.set(shiftX + px, shiftY + py, d)
    tgt.set(shiftX, shiftY, 0)
    camera.position.copy(pos)
    camera.lookAt(tgt)

    // the plate: a slight three-quarter, turning a little in the light
    const sway = reduced ? 0 : Math.sin(time * 0.35) * 0.07
    holder.rotation.set(0.05 + (reduced ? 0 : Math.sin(time * 0.23) * 0.015), -0.2 + sway, 0)
    holder.position.y = reduced ? 0 : Math.sin(time * 0.5) * 0.012
    deck.back.lookAt(camera.position)

    // the page opens: the softbox fades up, the neon strikes, one light sweep crosses the etching
    const up = Math.min(1, since / 0.9)
    const lit = up * up * (3 - 2 * up)
    bu.uStrength.value = 0.3 * lit * (1 + (reduced ? 0 : 0.035 * Math.sin(time * 0.55)))
    plate.faceMat.uniforms.uBright.value = (mobile ? 1.35 : 1.6) * lit
    const s = Math.min(1, Math.max(0, (since - 0.5) / 1.4))
    plate.faceMat.uniforms.uSweep.value = -1.6 + 3.2 * s
    plate.faceMat.uniforms.uSweepAmt.value = reduced || s >= 1 ? 0 : 1.1
    neon[0].on.value = strike(since, 0.35)
    neon[1].on.value = strike(since, 0.7)

    // the studio: black, a halo behind the plate, reflections at the Services rest angle
    const wp = world.params
    world.resetParams()
    wp.top = '#030304'
    wp.bottom = '#000000'
    wp.haloColor = '#e6eeff'
    wp.halo = 0.7 * lit
    wp.haloSize = Math.min(1.6, (TILE_H / (d * TAN * 2)) * 2.2)
    wp.focus.set(fit.sx * camera.aspect, fit.sy)
    wp.slits = 0
    wp.env = 1
    const envTurn = ENV_REST + (reduced ? 0 : 0.05 * Math.sin(time * 0.17))
    wp.envTurn = envTurn
    wp.key = 0
    wp.fill = 0.05
    plate.caps.envMapRotation.y = envTurn
    plate.sides.envMapRotation.y = envTurn
    frame.time = time
    frame.dt = dt
    frame.width = W
    frame.height = H
    world.update(frame, camera)

    composer.render(dt)

    // keep drawing while anything moves; a reduced-motion page settles and stops
    settled = reduced && since > 2.2 && pointer.distanceTo(pointerTo) < 1e-3
    if (visible && !settled) raf = requestAnimationFrame(draw)
  }
  function wake() {
    settled = false
    if (!raf && visible) raf = requestAnimationFrame(draw)
  }

  const io = new IntersectionObserver(es => {
    visible = es.some(e => e.isIntersecting) && document.visibilityState === 'visible'
    if (visible) {
      last = performance.now()
      wake()
    }
  })
  io.observe(canvas)
  const onVis = () => {
    visible = document.visibilityState === 'visible'
    if (visible) {
      last = performance.now()
      wake()
    }
  }
  document.addEventListener('visibilitychange', onVis)
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  resize()
  // redraw once the plate's etching has its font
  document.fonts?.ready.then(wake, () => {})

  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault()
    canvas.classList.add('is-lost')
  })

  return {
    dispose() {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pointermove', onPointer)
      composer.dispose()
      renderer.dispose()
    },
  }
}
