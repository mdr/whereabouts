/**
 * Game sounds: a spray while painting and an eraser rubbing while erasing,
 * the last-ten-seconds countdown, a soft marimba pair for a round starting
 * and for a round finishing early, a chicken for a pass, a whoosh for Clear,
 * and applause for the final results. One per-device switch (`soundOn` in
 * settings) silences everything.
 *
 * Browsers only let a page make sound after the player has tapped or pressed
 * something, so the audio context is created on the first such gesture, and
 * the recordings are fetched then too, never on page load.
 *
 * Sources, all CC0 on Freesound, cut and volume-matched:
 * - spray.mp3: ten steady stretches of "paint in spray 02.wav" by lukebadluck
 *   (#339121), 0.1 s of silence between them.
 * - eraser.mp3: nine rubs of "Eraser on Paper_1-2.aif" by lucaslara (#154461),
 *   laid out the same way.
 * - countdown.mp3: the last 10 s of ticking from "marktimer.wav" by MuzakPlz
 *   (#626908), its alarm cut to 2.5 s and faded, so the alarm starts 10 s in.
 * - chicken.mp3: the first three clucks of "Chicken clucking" by Breviceps
 *   (#456803).
 * - clear.mp3: "Swipe Whoosh" by qubodup (#60007).
 * - applause.mp3: "Voice_Crowd_Small_Expression_Applause_Stereo" by Nox_Sound
 *   (#752710).
 */
import { effect } from "@preact/signals"
import sprayUrl from "../assets/sounds/spray.mp3"
import eraserUrl from "../assets/sounds/eraser.mp3"
import countdownUrl from "../assets/sounds/countdown.mp3"
import chickenUrl from "../assets/sounds/chicken.mp3"
import clearUrl from "../assets/sounds/clear.mp3"
import applauseUrl from "../assets/sounds/applause.mp3"
import { soundOn } from "../settings/settings"
import type { Ms, Seconds } from "@whereabouts/shared/units"

type Slices = readonly (readonly [start: Seconds, length: Seconds])[]

/** A recording of separate stretches ([start, length]) chained at random while a stroke is held. */
interface Loop {
  slices: Slices
  volume: number
  /** How much of each later stretch's start to skip, so a long stroke sounds continuous. */
  attack: Seconds
  crossfade: Seconds
}

const LOOPS = {
  spray: {
    slices: [
      [0, 3.23],
      [3.33, 2.78],
      [6.21, 2.25],
      [8.56, 2.97],
      [11.63, 4.85],
      [16.58, 2.08],
      [18.76, 1.45],
      [20.31, 1.67],
      [22.08, 1.6],
      [23.78, 2.5]
    ],
    volume: 0.55,
    attack: 0.15,
    crossfade: 0.12
  },
  eraser: {
    slices: [
      [0, 0.3],
      [0.4, 0.34],
      [0.84, 0.5],
      [1.44, 0.38],
      [1.92, 0.3],
      [2.32, 0.46],
      [2.88, 0.3],
      [3.28, 0.3],
      [3.68, 0.8]
    ],
    volume: 0.4,
    attack: 0,
    crossfade: 0.06
  }
} satisfies Record<string, Loop>
type LoopName = keyof typeof LOOPS

const RELEASE: Seconds = 0.06
/** Seconds of ticking before the alarm in countdown.mp3. */
const COUNTDOWN: Seconds = 10
/** The countdown starts soft and reaches full volume at the alarm. */
const COUNTDOWN_START_GAIN = 0.25

const ONE_SHOT_VOLUME = { chicken: 0.45, clear: 0.5, applause: 0.6 }
type OneShot = keyof typeof ONE_SHOT_VOLUME
const VOLUME = { countdown: 0.6, cue: 0.3 }

const URLS = {
  spray: sprayUrl,
  eraser: eraserUrl,
  countdown: countdownUrl,
  chicken: chickenUrl,
  clear: clearUrl,
  applause: applauseUrl
}
type Clip = keyof typeof URLS

/**
 * When to start the countdown for a round with `timeLeft` to go: after
 * `delay`, from `offset` into the clip. Arriving with 6 s left starts 4 s
 * in, so the alarm still lands on zero; with no time left there is nothing.
 */
export function countdownPlan(timeLeft: Ms): { delay: Ms; offset: Seconds } | undefined {
  if (timeLeft <= 0) return undefined
  const lead = COUNTDOWN * 1000
  if (timeLeft >= lead) return { delay: timeLeft - lead, offset: 0 }
  return { delay: 0, offset: (lead - timeLeft) / 1000 }
}

/** The marimba pair: rising for a round starting, falling for finishing early. */
export enum Chime {
  RISING = "RISING",
  FALLING = "FALLING"
}

interface Voice {
  source: AudioBufferSourceNode
  gain: GainNode
}

class SoundEngine {
  private ctx: AudioContext | undefined = undefined
  private master: GainNode | undefined = undefined
  private buffers: Partial<Record<Clip, AudioBuffer>> = {}
  private loading = false
  private failedAt = -Infinity
  private stroke: { loop: LoopName; voices: Voice[]; nextAt: Seconds; last: number; timer: number } | undefined =
    undefined
  private ticking: Voice | undefined = undefined
  private pendingCountdown: number | undefined = undefined

  /** Create the audio context and start loading; call from a user gesture. */
  unlock(): void {
    const Ctor = typeof window === "undefined" ? undefined : window.AudioContext
    if (!Ctor) return
    if (!this.ctx) {
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.connect(this.ctx.destination)
    }
    // Not just "suspended": Safari has a third state, "interrupted", that a
    // tap should also try to leave.
    if (this.ctx.state !== "running") {
      void this.ctx.resume().catch(() => {
        // Refused without a user gesture; the next tap tries again.
      })
    }
    // Every tap calls this; after a failure, wait a while before asking again.
    if (this.loading || Date.now() - this.failedAt < 30_000) return
    this.loading = true
    for (const [clip, url] of Object.entries(URLS) as [Clip, string][]) {
      if (this.buffers[clip]) continue
      this.load(url).then(
        (buffer) => (this.buffers[clip] = buffer),
        (error: unknown) => {
          console.warn("could not load a sound", url, error)
          this.failedAt = Date.now()
          this.loading = false
        }
      )
    }
  }

  private async load(url: string): Promise<AudioBuffer> {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${res.status}`)
    return this.ctx!.decodeAudioData(await res.arrayBuffer())
  }

  private ready(): AudioContext | undefined {
    return soundOn.value && this.ctx?.state === "running" ? this.ctx : undefined
  }

  // ---- strokes: spray and eraser ----------------------------------------------

  /** The sound for the stroke being held: a loop's name, or undefined for none. Safe to repeat. */
  setStroke(loop: LoopName | undefined): void {
    if (this.stroke && this.stroke.loop !== loop) this.stopStroke()
    if (loop) this.startStroke(loop)
  }

  private startStroke(loop: LoopName): void {
    const ctx = this.ready()
    if (!ctx || !this.buffers[loop] || this.stroke) return
    this.stroke = { loop, voices: [], nextAt: ctx.currentTime + 0.01, last: -1, timer: 0 }
    this.scheduleStroke()
  }

  /** Keep half a second of stretches queued: random each time, never the same twice running. */
  private scheduleStroke(): void {
    const ctx = this.ctx
    const stroke = this.stroke
    const buffer = stroke && this.buffers[stroke.loop]
    if (!ctx || !stroke || !buffer) return
    const loop: Loop = LOOPS[stroke.loop]
    while (stroke.nextAt < ctx.currentTime + 0.5) {
      let i: number
      do i = Math.floor(Math.random() * loop.slices.length)
      while (i === stroke.last)
      const [offset, length] = loop.slices[i]!
      const first = stroke.voices.length === 0
      const skip = first ? 0 : Math.min(loop.attack, length / 3)
      const duration = length - skip
      const at = stroke.nextAt
      const source = ctx.createBufferSource()
      const gain = ctx.createGain()
      source.buffer = buffer
      source.connect(gain).connect(this.master!)
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(loop.volume, at + (first ? 0.015 : loop.crossfade))
      gain.gain.setValueAtTime(loop.volume, at + duration - loop.crossfade)
      gain.gain.linearRampToValueAtTime(0, at + duration)
      source.start(at, offset + skip, duration)
      stroke.voices.push({ source: source, gain })
      // Keep only the voices that may still be sounding.
      if (stroke.voices.length > 4) stroke.voices.splice(0, stroke.voices.length - 4)
      stroke.last = i
      stroke.nextAt = at + duration - loop.crossfade
    }
    stroke.timer = window.setTimeout(() => this.scheduleStroke(), 100)
  }

  private stopStroke(): void {
    const stroke = this.stroke
    if (!stroke) return
    this.stroke = undefined
    clearTimeout(stroke.timer)
    for (const voice of stroke.voices) this.fadeOut(voice, RELEASE)
  }

  private fadeOut(voice: Voice, seconds: Seconds): void {
    const ctx = this.ctx
    if (!ctx) return
    const time = ctx.currentTime
    try {
      voice.gain.gain.cancelScheduledValues(time)
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, time)
      voice.gain.gain.linearRampToValueAtTime(0, time + seconds)
      voice.source.stop(time + seconds + 0.02)
    } catch {
      /* already stopped */
    }
  }

  // ---- countdown ---------------------------------------------------------------

  /** Arrange the countdown for a round with `timeLeft` to go, replacing any other. */
  scheduleCountdown(timeLeft: Ms): void {
    this.stopCountdown()
    const plan = countdownPlan(timeLeft)
    if (!plan) return
    this.pendingCountdown = window.setTimeout(() => {
      this.pendingCountdown = undefined
      this.playCountdown(plan.offset)
    }, plan.delay)
  }

  private playCountdown(offset: Seconds): void {
    const ctx = this.ready()
    const buffer = this.buffers.countdown
    if (!ctx || !buffer) return
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    source.buffer = buffer
    source.connect(gain).connect(this.master!)
    const time = ctx.currentTime + 0.01
    const progress = Math.min(1, offset / COUNTDOWN)
    const startGain = VOLUME.countdown * (COUNTDOWN_START_GAIN + (1 - COUNTDOWN_START_GAIN) * progress)
    gain.gain.setValueAtTime(startGain, time)
    gain.gain.linearRampToValueAtTime(VOLUME.countdown, time + Math.max(0, COUNTDOWN - offset))
    source.start(time, offset)
    source.onended = () => {
      if (this.ticking?.source === source) this.ticking = undefined
    }
    this.ticking = { source: source, gain }
  }

  /** Stop the countdown (and cancel one still to come) before its alarm. */
  stopCountdown(): void {
    if (this.pendingCountdown !== undefined) clearTimeout(this.pendingCountdown)
    this.pendingCountdown = undefined
    if (this.ticking) this.fadeOut(this.ticking, 0.08)
    this.ticking = undefined
  }

  // ---- one-shots and cues ------------------------------------------------------

  /** Play a recording once: the chicken for a pass, the whoosh for Clear, applause at the end. */
  play(name: OneShot): void {
    const ctx = this.ready()
    const buffer = this.buffers[name]
    if (!ctx || !buffer) return
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    source.buffer = buffer
    gain.gain.value = ONE_SHOT_VOLUME[name]
    source.connect(gain).connect(this.master!)
    source.start(ctx.currentTime + 0.01)
  }

  /** Two soft marimba notes a fifth apart. */
  chime(kind: Chime): void {
    const ctx = this.ready()
    if (!ctx) return
    const low = 659
    const notes = kind === Chime.RISING ? [low, low * 1.5] : [low * 1.5, low]
    const time = ctx.currentTime + 0.01
    notes.forEach((frequency, i) => this.mallet(frequency, time + i * 0.14))
  }

  /** A mallet tone: a sine with two quickly decaying overtones. */
  private mallet(frequency: number, at: Seconds): void {
    const ctx = this.ctx!
    for (const [multiplier, amplitude, decay] of [
      [1, 1, 0.9],
      [4, 0.25, 0.15],
      [10, 0.05, 0.05]
    ] as const) {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.type = "sine"
      oscillator.frequency.value = frequency * multiplier
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(VOLUME.cue * amplitude, at + 0.004)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + decay)
      oscillator.connect(gain).connect(this.master!)
      oscillator.start(at)
      oscillator.stop(at + decay + 0.05)
    }
  }

  /** Silence everything at once, for the switch going off or leaving a game. */
  stopAll(): void {
    this.stopStroke()
    this.stopCountdown()
  }
}

export const sound = new SoundEngine()

let installed = false

/**
 * Unlock audio on the first tap or key press, and silence everything when
 * the switch goes off. Call once at start-up.
 */
export function installSound(): void {
  if (installed || typeof window === "undefined") return
  installed = true
  const unlock = () => sound.unlock()
  for (const type of ["pointerdown", "keydown", "touchend"]) {
    window.addEventListener(type, unlock, { capture: true, passive: true })
  }
  effect(() => {
    if (!soundOn.value) sound.stopAll()
  })
}
