import * as THREE from 'three'
import type { Frame } from '../core/types'

/*
 * The shared world for Hark Frost: a BLACK studio. Almost everything is pure
 * black; light exists only where it makes frosted glass glow.
 *
 *  - BACKDROP (camera-centred dome, opaque so glass refracts it): a black
 *    gradient, one soft BACKLIGHT HALO behind the subject (frosted glass in
 *    front of it glows like a lit sandblasted sign), and optional HAIRLINE
 *    light slits (razor-thin architectural light lines) that polished edges
 *    and clear glass bend.
 *  - STUDIO REFLECTIONS (PMREM, built once, lightly blurred so polished
 *    bevels get CRISP highlights): a black room with a long hairline strip
 *    overhead, two tall strips, a broad soft card behind (a gentle sheen on
 *    frosted faces).
 *  - KEY + FILL: a directional key for glints, a very low hemisphere.
 *
 * params (set every frame; the engine resets them first; damped):
 *   top / bottom     backdrop gradient (keep near black)
 *   halo             0..1.5 backlight halo strength
 *   haloColor        halo colour (a barely-cool white)
 *   haloSize         halo radius in screen units (1 = default)
 *   focus            screen point the halo sits at (x = ndc.x·aspect, y = ndc.y)
 *   slits            0..1 hairline light slits
 *   slitAngle        radians (0 = vertical slits)
 *   env / envTurn    studio reflections / rotation (sweep highlights)
 *   keyDir / key / fill
 */

export interface WorldParams {
  top: THREE.ColorRepresentation
  bottom: THREE.ColorRepresentation
  halo: number
  haloColor: THREE.ColorRepresentation
  haloSize: number
  focus: THREE.Vector2
  slits: number
  slitAngle: number
  env: number
  envTurn: number
  keyDir: THREE.Vector3
  key: number
  fill: number
}

export const WORLD_DEFAULTS = {
  top: '#030304',
  bottom: '#000000',
  halo: 0.8,
  haloColor: '#e6eeff',
  haloSize: 1,
  slits: 0.35,
  slitAngle: 0,
  env: 1,
  envTurn: 0,
  key: 1.6,
  fill: 0.12,
}

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const FRAG = /* glsl */ `
  uniform vec3 uTop, uBottom, uHalo;
  uniform float uHaloK, uHaloSize, uSlits, uSlitAngle, uTanV, uTime;
  uniform vec2 uFocus, uShift;
  uniform mat3 uViewRot;
  varying vec3 vDir;
  float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float pow2(float x) { return x * x; }
  void main() {
    vec3 v = uViewRot * normalize(vDir);
    float z = max(-v.z, 0.05);
    vec2 p = v.xy / z / uTanV + uShift;
    float h = clamp(p.y * 0.3 + 0.5, 0.0, 1.0);
    vec3 col = mix(uBottom, uTop, smoothstep(0.2, 1.0, h));
    // the backlight halo: a broad soft glow + a tighter core
    vec2 q = (p - uFocus) / max(uHaloSize, 0.05);
    float r2 = dot(q, q);
    col += uHalo * uHaloK * (exp(-r2 / 0.45) * 0.07 + exp(-r2 / 0.07) * 0.24);
    // hairline slits: razor-thin light lines (three, unevenly spaced), fading top and bottom
    float ca = cos(uSlitAngle), sa = sin(uSlitAngle);
    vec2 s = vec2(ca * (p.x - uFocus.x) - sa * (p.y - uFocus.y), sa * (p.x - uFocus.x) + ca * (p.y - uFocus.y));
    float band = exp(-s.y * s.y / 0.9);
    float w = 0.0022;
    float lines = exp(-pow2((s.x + 0.62) / w)) + 0.7 * exp(-pow2((s.x - 0.44) / w)) + 0.45 * exp(-pow2((s.x - 0.9) / (w * 1.4)));
    col += uHalo * vec3(0.95, 0.97, 1.0) * lines * band * uSlits * 0.9;
    col += (hash(gl_FragCoord.xy + fract(uTime) * 37.0) - 0.5) / 255.0;
    gl_FragColor = vec4(max(col, 0.0), 1.0);
  }
`

export class World {
  object = new THREE.Group()
  key: THREE.DirectionalLight
  hemi: THREE.HemisphereLight
  envMap: THREE.Texture | null = null
  params: WorldParams = {
    ...WORLD_DEFAULTS,
    focus: new THREE.Vector2(0.25, 0.05),
    keyDir: new THREE.Vector3(-0.35, 0.85, 0.45),
  }
  private cur = {
    top: new THREE.Color(),
    bottom: new THREE.Color(),
    haloColor: new THREE.Color(),
    halo: WORLD_DEFAULTS.halo,
    haloSize: 1,
    slits: WORLD_DEFAULTS.slits,
    slitAngle: 0,
    env: 1,
    envTurn: 0,
    key: WORLD_DEFAULTS.key,
    fill: WORLD_DEFAULTS.fill,
    focus: new THREE.Vector2(0.25, 0.05),
  }
  private first = true
  private clock = 0
  private u = {
    uTop: { value: new THREE.Color() },
    uBottom: { value: new THREE.Color() },
    uHalo: { value: new THREE.Color() },
    uHaloK: { value: 1 },
    uHaloSize: { value: 1 },
    uSlits: { value: 0.35 },
    uSlitAngle: { value: 0 },
    uTanV: { value: 0.4 },
    uTime: { value: 0 },
    uFocus: { value: new THREE.Vector2() },
    uShift: { value: new THREE.Vector2() },
    uViewRot: { value: new THREE.Matrix3() },
  }
  private tmp = new THREE.Color()
  private tmpV = new THREE.Vector3()
  private tmpM = new THREE.Matrix4()

  constructor(
    private scene: THREE.Scene,
    private mobile: boolean,
    renderer?: THREE.WebGLRenderer,
  ) {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(900, 48, 24),
      new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, toneMapped: false, uniforms: this.u, vertexShader: VERT, fragmentShader: FRAG }),
    )
    dome.frustumCulled = false
    dome.renderOrder = -10
    this.object.add(dome)
    this.key = new THREE.DirectionalLight(0xffffff, WORLD_DEFAULTS.key)
    scene.add(this.key)
    scene.add(this.key.target)
    this.hemi = new THREE.HemisphereLight(0xdfe6f0, 0x050506, WORLD_DEFAULTS.fill)
    scene.add(this.hemi)
    if (renderer) this.buildStudio(renderer)
  }

  /** A black room with crisp light strips: polished bevels read as razor edges. */
  private buildStudio(renderer: THREE.WebGLRenderer) {
    const room = new THREE.Scene()
    room.add(new THREE.Mesh(new THREE.BoxGeometry(24, 16, 24), new THREE.MeshBasicMaterial({ color: '#000000', side: THREE.BackSide })))
    const panel = (w: number, h: number, color: string, power: number, pos: [number, number, number]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }))
      m.position.set(...pos)
      m.lookAt(0, 0, 0)
      room.add(m)
    }
    panel(14, 0.28, '#ffffff', 7, [0, 7.8, 0]) // hairline overhead strip
    panel(0.45, 12, '#ffffff', 7, [-9.5, 0.5, 2.5]) // tall strip left
    panel(0.3, 12, '#f2f5ff', 5, [9.5, 0.5, -1.5]) // tall strip right
    panel(12, 0.18, '#ffffff', 6, [0, 2.6, 10]) // crisp front edge line
    panel(10, 6, '#ffffff', 0.5, [0, 2, -11]) // broad soft card behind (frost sheen)
    const pmrem = new THREE.PMREMGenerator(renderer)
    const rt = pmrem.fromScene(room, 0.012)
    pmrem.dispose()
    room.traverse(o => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.geometry.dispose()
        ;(m.material as THREE.Material).dispose()
      }
    })
    this.envMap = rt.texture
    this.scene.environment = rt.texture
  }

  resetParams() {
    const p = this.params
    p.top = WORLD_DEFAULTS.top
    p.bottom = WORLD_DEFAULTS.bottom
    p.halo = WORLD_DEFAULTS.halo
    p.haloColor = WORLD_DEFAULTS.haloColor
    p.haloSize = WORLD_DEFAULTS.haloSize
    p.slits = WORLD_DEFAULTS.slits
    p.slitAngle = WORLD_DEFAULTS.slitAngle
    p.env = WORLD_DEFAULTS.env
    p.envTurn = WORLD_DEFAULTS.envTurn
    p.key = WORLD_DEFAULTS.key
    p.fill = WORLD_DEFAULTS.fill
    p.focus.set(0.25, 0.05)
    p.keyDir.set(-0.35, 0.85, 0.45)
  }

  update(frame: Frame, camera: THREE.Camera) {
    const p = this.params
    const c = this.cur
    const k = this.first ? 1 : 1 - Math.exp(-4 * frame.dt)
    this.first = false
    c.top.lerp(this.tmp.set(p.top), k)
    c.bottom.lerp(this.tmp.set(p.bottom), k)
    c.haloColor.lerp(this.tmp.set(p.haloColor), k)
    c.halo += (p.halo - c.halo) * k
    c.haloSize += (p.haloSize - c.haloSize) * k
    c.slits += (p.slits - c.slits) * k
    c.slitAngle += (p.slitAngle - c.slitAngle) * k
    c.env += (p.env - c.env) * k
    let dt = p.envTurn - c.envTurn
    dt = Math.atan2(Math.sin(dt), Math.cos(dt))
    c.envTurn += dt * k
    c.key += (p.key - c.key) * k
    c.fill += (p.fill - c.fill) * k
    c.focus.lerp(p.focus, k)
    if (!frame.still) this.clock += frame.dt

    const u = this.u
    u.uTop.value.copy(c.top)
    u.uBottom.value.copy(c.bottom)
    u.uHalo.value.copy(c.haloColor)
    u.uHaloK.value = c.halo
    u.uHaloSize.value = c.haloSize
    u.uSlits.value = c.slits
    u.uSlitAngle.value = c.slitAngle
    u.uTime.value = this.clock
    u.uFocus.value.copy(c.focus)
    const persp = camera as THREE.PerspectiveCamera
    u.uTanV.value = Math.tan(THREE.MathUtils.degToRad((persp.fov ?? 45) / 2))
    camera.updateMatrixWorld()
    this.tmpM.extractRotation(camera.matrixWorldInverse)
    u.uViewRot.value.setFromMatrix4(this.tmpM)
    camera.getWorldDirection(this.tmpV)
    const yaw = Math.atan2(this.tmpV.x, -this.tmpV.z)
    const pitch = Math.asin(THREE.MathUtils.clamp(this.tmpV.y, -1, 1))
    u.uShift.value.set(Math.sin(yaw) * 0.25, pitch * 0.2)

    this.scene.environmentIntensity = c.env
    this.scene.environmentRotation.y = c.envTurn
    this.key.intensity = c.key
    this.key.position.copy(camera.position).addScaledVector(this.tmpV.copy(p.keyDir).normalize(), 50)
    this.key.target.position.copy(camera.position)
    this.key.target.updateMatrixWorld()
    this.hemi.intensity = c.fill
    this.object.position.copy(camera.position)
    void this.mobile
  }
}
