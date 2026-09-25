import type { Frame } from '../core/types'
import type { EngineState } from '../core/Engine'

/*
 * Hark Frost sound: cold air in a black room (WebAudio, no files).
 *
 *   drone    "cold air": a very soft low bed — slow-moving low-passed brown
 *            noise plus a sine pair (an open fifth, each voice a pure sine
 *            with a faint octave so laptop speakers hear it), a hair detuned
 *            so it beats slowly. Each chapter glides the pair (~3 s) to its
 *            own root; the shield chapter leans on a tritone.
 *   air      a faint high layer: high-passed noise, breathing on a slow LFO,
 *            opening a touch with scroll speed (the draught of moving).
 *   glass    occasional crystalline tones: struck glass, inharmonic partials
 *            (1 : 2.76 : 5.40 : 8.93, the modes of a free glass bar), a
 *            fast attack and a long decay into a dark generated room. Very
 *            sparse: one every ~9–16 s at rest.
 *   cut()    a breath on the glass: a band-passed noise swell (in 0.35 s,
 *            out ~1 s) and one tiny glass tick as it clears.
 *   blip()   a tiny glass tick (nav, buttons).
 *   tone()   a pure sine a chapter may ask for (also via 'hark:tone' events).
 *   meter()  three band levels for the chrome's sound glyph.
 *
 * Off by default. Sound only ever starts from a real gesture: the toggle's
 * own click / tap / Enter / Space. A remembered "on" (localStorage) waits for
 * the first real activation (a click or tap, or Enter / Space on a control;
 * never Tab, arrows or scrolling). Faded out and suspended while the tab is
 * hidden. On iOS the audio session is set to "playback" so the silent switch
 * doesn't swallow it. Levels stay very low, behind a gentle compressor.
 */

const STORE_KEY = 'hark-frost:sound'

function stored(): boolean | null {
  try {
    const v = localStorage.getItem(STORE_KEY)
    return v === '1' ? true : v === '0' ? false : null
  } catch {
    return null
  }
}

interface Mode {
  /** the drone's sine pair (MIDI) */
  pair: [number, number]
  /** struck-glass pitches (MIDI) */
  glass: number[]
  /** drone low-pass (Hz) */
  cutoff: number
  /** seconds between glass tones at rest: [min, max] */
  every: [number, number]
  /** glass level multiplier */
  level: number
}

const MODES: Record<string, Mode> = {
  hero: { pair: [38, 45], glass: [81, 83, 86, 88, 90, 93], cutoff: 340, every: [9, 15], level: 1 },
  work: { pair: [40, 47], glass: [83, 86, 88, 91, 93, 95], cutoff: 360, every: [10, 16], level: 0.9 },
  services: { pair: [38, 45], glass: [81, 84, 86, 88, 91, 93], cutoff: 380, every: [9, 15], level: 0.95 },
  voices: { pair: [36, 43], glass: [79, 81, 84, 86, 88, 91], cutoff: 300, every: [11, 17], level: 0.85 },
  // the threat: a darker bed, a tritone, rarer and lower glass
  shield: { pair: [34, 40], glass: [80, 82, 85, 86, 89, 92], cutoff: 240, every: [13, 19], level: 0.7 },
  process: { pair: [41, 48], glass: [81, 83, 86, 88, 90, 93], cutoff: 360, every: [10, 16], level: 0.9 },
  contact: { pair: [38, 50], glass: [86, 88, 90, 93, 95, 98], cutoff: 420, every: [8, 14], level: 1 },
}

/** modes of a free glass bar: [ratio, level, decay factor] */
const PARTIALS: [number, number, number][] = [
  [1, 1, 1],
  [2.756, 0.42, 0.55],
  [5.404, 0.2, 0.3],
  [8.933, 0.09, 0.16],
]

const ACTIVATE_KEYS = new Set(['Enter', ' ', 'Spacebar'])
const CONTROL = 'a[href], button, [role="button"], [role="switch"], summary, input, select, textarea'
const MASTER_LEVEL = 0.7
const TONE_MAX = 0.035
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12)
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const rand = (a: number, b: number) => a + Math.random() * (b - a)

function setAudioSession(type: string) {
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } }
    if (nav.audioSession) nav.audioSession.type = type
  } catch {
    /* not supported */
  }
}

export class Sound {
  enabled = false
  onChange: ((enabled: boolean) => void)[] = []

  private ctx: AudioContext | null = null
  private master!: GainNode
  private dry!: GainNode
  private room!: GainNode
  private droneFilter!: BiquadFilterNode
  private airGain!: GainNode
  private pair: OscillatorNode[][] = []
  private analyser: AnalyserNode | null = null
  private bins = new Uint8Array(64)
  private noise: AudioBuffer | null = null
  private toneOsc: OscillatorNode | null = null
  private toneGain: GainNode | null = null

  private chapter = 'hero'
  private modeKey = ''
  private mode: Mode = MODES.hero
  private nextGlass = 0
  private lastAirAt = 0
  private air = 0
  private lastCut = 0
  private lastBlip = 0
  private suspendTimer = 0
  private hidden = typeof document !== 'undefined' && document.hidden
  /** a remembered "on" waiting for the first real gesture */
  private armed = false
  private gestureBound = false
  private toneHz = 440
  private toneLevel = 0

  constructor() {
    this.armed = stored() === true
    if (this.armed) this.waitForGesture()
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden
      this.applyRunning()
    })
    window.addEventListener('hark:tone', e => {
      const d = (e as CustomEvent<{ hz?: number; level?: number }>).detail
      if (d && typeof d.hz === 'number') this.tone(d.hz, d.level ?? 0)
    })
  }

  /** was sound on last visit? (it still needs a gesture to start) */
  get remembered() {
    return stored() === true
  }

  /** Flip sound on/off. Call from a user gesture (click / key). */
  toggle() {
    this.armed = false
    this.setEnabled(!this.enabled)
    try {
      localStorage.setItem(STORE_KEY, this.enabled ? '1' : '0')
    } catch {
      /* storage blocked: the choice lasts for this visit */
    }
  }

  /** Follow the story: the drone per chapter, sparse glass, air from scroll speed. */
  update(frame: Frame, state: EngineState) {
    const slot = state.slots[state.index]
    if (slot) this.chapter = slot.def.id
    const ctx = this.live()
    if (!ctx) return
    if (this.chapter !== this.modeKey) this.setMode(this.chapter, ctx)
    const now = ctx.currentTime
    const v = Math.min(3, Math.abs(frame.velocity || 0))

    // the draught of moving: the air layer opens a little while scrolling
    if (now - this.lastAirAt > 0.12) {
      this.lastAirAt = now
      const target = 0.006 + v * 0.004
      if (Math.abs(target - this.air) > 0.0008) {
        this.air = target
        this.airGain.gain.setTargetAtTime(target, now, 0.5)
      }
    }

    // struck glass, very sparse (a touch less rare while moving)
    if (!this.nextGlass) this.nextGlass = now + rand(2.5, 5)
    if (now >= this.nextGlass) {
      const g = this.mode.glass
      const m = g[Math.floor(Math.random() * g.length)]
      this.strike(ctx, now + 0.02, m, rand(0.012, 0.02) * this.mode.level, rand(3.2, 4.6), rand(-0.7, 0.7))
      // now and then a second, softer note answers a fifth or an octave up
      if (Math.random() < 0.3) this.strike(ctx, now + rand(0.35, 0.8), m + (Math.random() < 0.5 ? 7 : 12), 0.007 * this.mode.level, 3, rand(-0.8, 0.8))
      const [a, b] = this.mode.every
      this.nextGlass = now + rand(a, b) / (1 + v * 0.35)
    }
  }

  /** A chapter cut: a breath on the glass, then a tiny tick as it clears. */
  cut(_from: number, _to: number) {
    const ctx = this.live()
    if (!ctx || !this.noise) return
    const now = ctx.currentTime
    if (now - this.lastCut < 0.5) return
    this.lastCut = now
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 0.7
    bp.frequency.setValueAtTime(620, now)
    bp.frequency.exponentialRampToValueAtTime(1500, now + 0.34)
    bp.frequency.exponentialRampToValueAtTime(820, now + 1.1)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 2600
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(0.032, now + 0.34)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.15)
    src.connect(bp).connect(lp).connect(g)
    g.connect(this.dry)
    const send = ctx.createGain()
    send.gain.value = 0.5
    g.connect(send).connect(this.room)
    src.start(now, Math.random() * 2)
    src.stop(now + 1.2)
    // as it clears: one tiny glass tick in the new chapter's key
    const m = MODES[this.chapter] ?? this.mode
    this.tick(ctx, now + 0.62, m.glass[m.glass.length - 1] + 12, 0.012)
  }

  /** A tiny glass tick (nav, buttons). `pitch` steps up the chapter's glass scale. No-op while off. */
  blip(pitch = 0) {
    const ctx = this.live()
    if (!ctx) return
    const now = ctx.currentTime
    if (now - this.lastBlip < 0.06) return
    this.lastBlip = now
    const p = Math.max(0, Math.round(pitch))
    const scale = this.mode.glass
    const m = scale[p % scale.length] + 12 * Math.floor(p / scale.length)
    this.tick(ctx, now, m + 12, 0.014)
  }

  /** A pure sine a chapter may ask for: level 0..1 (0 releases it). */
  tone(hz: number, level: number) {
    if (Number.isFinite(hz) && hz > 20 && hz < 12000) this.toneHz = hz
    this.toneLevel = clamp01(Number.isFinite(level) ? level : 0)
    this.applyTone()
  }

  /** Three band levels 0..1 (low → high) for a level glyph; false while silent. */
  meter(out: number[]): boolean {
    const ctx = this.live()
    if (!ctx || !this.analyser) return false
    this.analyser.getByteFrequencyData(this.bins)
    const b = this.bins
    const band = (a: number, z: number) => {
      let m = 0
      for (let i = a; i <= z; i++) m = Math.max(m, b[i])
      return m / 255
    }
    out[0] = band(0, 3)
    out[1] = band(4, 14)
    out[2] = band(15, 50)
    return true
  }

  /* ------------------------------------------------------------ internals */

  private live() {
    const ctx = this.ctx
    if (!ctx || !this.enabled || this.hidden || ctx.state !== 'running') return null
    return ctx
  }

  private setEnabled(on: boolean) {
    if (on === this.enabled) return
    this.enabled = on
    setAudioSession(on ? 'playback' : 'auto')
    if (on) {
      try {
        this.ensureGraph()
      } catch (err) {
        console.warn('[hark] audio unavailable', err)
      }
    }
    this.applyRunning(true)
    for (const fn of this.onChange) fn(on)
  }

  /** Resume + fade in, or fade out + suspend, from enabled / hidden. */
  private applyRunning(greet = false) {
    const ctx = this.ctx
    if (!ctx) return
    clearTimeout(this.suspendTimer)
    const now = ctx.currentTime
    if (this.enabled && !this.hidden) {
      ctx
        .resume()
        .then(() => {
          if (!this.enabled || this.hidden) return
          if (ctx.state !== 'running') return this.waitForGesture()
          const t = ctx.currentTime
          this.master.gain.cancelScheduledValues(t)
          this.master.gain.setValueAtTime(this.master.gain.value, t)
          this.master.gain.setTargetAtTime(MASTER_LEVEL, t, 0.9)
          this.modeKey = ''
          this.setMode(this.chapter, ctx)
          this.applyTone()
          this.nextGlass = t + rand(3, 6)
          if (greet) {
            // "on": one struck glass, answered an octave up
            const g = this.mode.glass
            this.strike(ctx, t + 0.08, g[2], 0.018, 4.2, -0.25)
            this.strike(ctx, t + 0.5, g[2] + 12, 0.008, 3.2, 0.35)
          }
        })
        .catch(() => this.waitForGesture())
    } else {
      this.master.gain.cancelScheduledValues(now)
      this.master.gain.setValueAtTime(this.master.gain.value, now)
      this.master.gain.setTargetAtTime(0, now, this.hidden ? 0.05 : 0.25)
      this.suspendTimer = window.setTimeout(
        () => {
          if (!this.enabled || this.hidden) ctx.suspend().catch(() => {})
        },
        this.hidden ? 300 : 1300,
      )
    }
  }

  /** Start audio on the first real gesture (a remembered "on", or a blocked resume). */
  private waitForGesture() {
    if (this.gestureBound) return
    this.gestureBound = true
    let sx = 0
    let sy = 0
    const events = ['click', 'keydown', 'touchstart', 'touchend'] as const
    const handler = (e: Event) => {
      if (e.type === 'touchstart') {
        const t = (e as TouchEvent).touches[0]
        if (t) {
          sx = t.clientX
          sy = t.clientY
        }
        return
      }
      if (e.type === 'touchend') {
        // a tap, not a scroll or a swipe
        const t = (e as TouchEvent).changedTouches[0]
        if (!t || Math.hypot(t.clientX - sx, t.clientY - sy) > 12) return
      }
      // keyboard: only Enter / Space on a control is "play"; Tab and friends are just moving around
      if (e instanceof KeyboardEvent) {
        if (!ACTIVATE_KEYS.has(e.key) || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
        if (!(e.target as Element | null)?.closest?.(CONTROL)) return
      }
      for (const ev of events) window.removeEventListener(ev, handler, true)
      this.gestureBound = false
      const onToggle = (e.target as Element | null)?.closest?.('[data-sound-toggle]')
      if (this.armed) {
        this.armed = false
        // the toggle's own click decides for itself
        if (!onToggle) this.setEnabled(true)
      } else if (this.enabled) this.applyRunning()
    }
    for (const ev of events) window.addEventListener(ev, handler, { capture: true, passive: true })
  }

  private ensureGraph() {
    if (this.ctx) return
    const AC =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC({ latencyHint: 'playback' })
    this.ctx = ctx
    const sr = ctx.sampleRate

    // master → high-pass → glue compression → out (+ a meter tap)
    this.master = ctx.createGain()
    this.master.gain.value = 0
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 38
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -24
    comp.knee.value = 18
    comp.ratio.value = 3
    comp.attack.value = 0.01
    comp.release.value = 0.4
    this.master.connect(hp).connect(comp).connect(ctx.destination)
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 128
    this.analyser.smoothingTimeConstant = 0.8
    this.analyser.minDecibels = -96
    this.analyser.maxDecibels = -36
    comp.connect(this.analyser)

    this.dry = ctx.createGain()
    this.dry.connect(this.master)

    // a dark, cold room: a generated stereo impulse (decaying noise, the
    // highs dying first), ~3.2 s
    const irLen = Math.floor(sr * 3.2)
    const ir = ctx.createBuffer(2, irLen, sr)
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c)
      let lp = 0
      for (let i = 0; i < irLen; i++) {
        const t = i / irLen
        const k = 0.5 + 0.45 * t // the tail darkens
        lp = lp * k + (Math.random() * 2 - 1) * (1 - k)
        d[i] = lp * Math.pow(1 - t, 2.6) * (i < sr * 0.012 ? i / (sr * 0.012) : 1)
      }
    }
    const verb = ctx.createConvolver()
    verb.buffer = ir
    this.room = ctx.createGain()
    const wet = ctx.createGain()
    wet.gain.value = 1.6
    this.room.connect(verb).connect(wet).connect(this.master)

    // noise: brown for the drone and the breath, white for the air
    const nLen = Math.floor(sr * 4)
    this.noise = ctx.createBuffer(1, nLen, sr)
    const white = ctx.createBuffer(1, nLen, sr)
    const nd = this.noise.getChannelData(0)
    const wd = white.getChannelData(0)
    let last = 0
    for (let i = 0; i < nLen; i++) {
      const w = Math.random() * 2 - 1
      wd[i] = w
      last = (last + 0.02 * w) / 1.02
      nd[i] = last * 3.2
    }

    // the drone: cold air (low brown noise) + the sine pair
    this.droneFilter = ctx.createBiquadFilter()
    this.droneFilter.type = 'lowpass'
    this.droneFilter.frequency.value = this.mode.cutoff
    this.droneFilter.Q.value = 0.3
    const droneGain = ctx.createGain()
    droneGain.gain.value = 0.5
    this.droneFilter.connect(droneGain).connect(this.dry)
    const droneSend = ctx.createGain()
    droneSend.gain.value = 0.12
    droneGain.connect(droneSend).connect(this.room)
    // the bed breathes on a very slow filter sweep
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.031
    const lfoAmt = ctx.createGain()
    lfoAmt.gain.value = 90
    lfo.connect(lfoAmt).connect(this.droneFilter.frequency)
    lfo.start()

    const bed = ctx.createBufferSource()
    bed.buffer = this.noise
    bed.loop = true
    const bedGain = ctx.createGain()
    bedGain.gain.value = 0.11
    bed.connect(bedGain).connect(this.droneFilter)
    bed.start()

    this.pair = this.mode.pair.map((m, i) => {
      const vg = ctx.createGain()
      vg.gain.value = i ? 0.028 : 0.036
      // each voice swells on its own slow breath
      const br = ctx.createOscillator()
      br.frequency.value = 0.043 + i * 0.019
      const brAmt = ctx.createGain()
      brAmt.gain.value = 0.012
      br.connect(brAmt).connect(vg.gain)
      br.start(ctx.currentTime + i * 1.3)
      vg.connect(this.droneFilter)
      const f = mtof(m)
      return [
        [1, 1, 0.12],
        [2, 0.22, -0.18],
      ].map(([ratio, level, detune]) => {
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.value = f * ratio + detune
        const g = ctx.createGain()
        g.gain.value = level
        o.connect(g).connect(vg)
        o.start()
        return o
      })
    })

    // the air: a faint high hiss that breathes
    const hiss = ctx.createBufferSource()
    hiss.buffer = white
    hiss.loop = true
    const hhp = ctx.createBiquadFilter()
    hhp.type = 'highpass'
    hhp.frequency.value = 6800
    const hlp = ctx.createBiquadFilter()
    hlp.type = 'lowpass'
    hlp.frequency.value = 12000
    this.airGain = ctx.createGain()
    this.air = 0.006
    this.airGain.gain.value = this.air
    const airLfo = ctx.createOscillator()
    airLfo.frequency.value = 0.07
    const airAmt = ctx.createGain()
    airAmt.gain.value = 0.0035
    airLfo.connect(airAmt).connect(this.airGain.gain)
    airLfo.start()
    const airPan = this.panner(ctx, 0.2)
    hiss.connect(hhp).connect(hlp).connect(this.airGain).connect(airPan).connect(this.dry)
    const airSend = ctx.createGain()
    airSend.gain.value = 0.4
    this.airGain.connect(airSend).connect(this.room)
    hiss.start(0, 1.3)

    // a pure tone a chapter may ask for
    this.toneOsc = ctx.createOscillator()
    this.toneOsc.type = 'sine'
    this.toneOsc.frequency.value = this.toneHz
    this.toneGain = ctx.createGain()
    this.toneGain.gain.value = 0
    this.toneOsc.connect(this.toneGain).connect(this.dry)
    this.toneOsc.start()
  }

  private panner(ctx: AudioContext, pan: number): AudioNode {
    if (typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner()
      p.pan.value = pan
      return p
    }
    return ctx.createGain()
  }

  private setMode(id: string, ctx: AudioContext) {
    const m = MODES[id] ?? MODES.hero
    this.modeKey = id
    this.mode = m
    const now = ctx.currentTime
    // the pair glides slowly to the new chapter's root
    this.pair.forEach((voice, i) => {
      const f = mtof(m.pair[i] ?? m.pair[0])
      voice.forEach((o, k) => o.frequency.setTargetAtTime(f * (k ? 2 : 1) + (k ? -0.18 : 0.12), now, 1.1))
    })
    this.droneFilter.frequency.setTargetAtTime(m.cutoff, now, 1.2)
  }

  /** struck glass: inharmonic partials, fast attack, long decay into the room */
  private strike(ctx: AudioContext, at: number, midi: number, level: number, decay: number, pan: number) {
    if (level <= 0) return
    const f = mtof(midi)
    const out = ctx.createGain()
    out.gain.value = 1
    const p = this.panner(ctx, pan)
    out.connect(p)
    const d = ctx.createGain()
    d.gain.value = 0.45
    p.connect(d).connect(this.dry)
    p.connect(this.room)
    for (const [ratio, lv, dk] of PARTIALS) {
      const hz = f * ratio
      if (hz > 15000) continue
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = hz
      o.detune.value = rand(-3, 3)
      const g = ctx.createGain()
      const peak = Math.max(0.0002, level * lv)
      const len = Math.max(0.2, decay * dk)
      g.gain.setValueAtTime(0.0001, at)
      g.gain.exponentialRampToValueAtTime(peak, at + 0.003)
      g.gain.exponentialRampToValueAtTime(0.0001, at + len)
      o.connect(g).connect(out)
      o.start(at)
      o.stop(at + len + 0.05)
    }
  }

  /** a tiny tick: the top partials of a glass strike, gone in ~0.1 s */
  private tick(ctx: AudioContext, at: number, midi: number, level: number) {
    const f = Math.min(5200, mtof(midi))
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(level, at + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.11)
    const o1 = ctx.createOscillator()
    o1.type = 'sine'
    o1.frequency.value = f
    const o2 = ctx.createOscillator()
    o2.type = 'sine'
    o2.frequency.value = Math.min(14000, f * 2.756)
    const g2 = ctx.createGain()
    g2.gain.value = 0.35
    o1.connect(g)
    o2.connect(g2).connect(g)
    g.connect(this.dry)
    const s = ctx.createGain()
    s.gain.value = 0.35
    g.connect(s).connect(this.room)
    o1.start(at)
    o2.start(at)
    o1.stop(at + 0.14)
    o2.stop(at + 0.1)
  }

  private applyTone() {
    const ctx = this.ctx
    if (!ctx || !this.toneOsc || !this.toneGain) return
    const now = ctx.currentTime
    this.toneOsc.frequency.setTargetAtTime(this.toneHz, now, 0.08)
    this.toneGain.gain.setTargetAtTime(this.toneLevel * TONE_MAX, now, 0.12)
  }
}
