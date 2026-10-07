import type { Tab } from "../pages/Tab.ts"

export interface SoundEvent {
  kind: "buffer" | "stop" | "osc"
  /** A recorded clip, known by its length. */
  clip?: string | null
  freq?: number
  /** performance.now() in the page. */
  at: number
}

declare global {
  interface Window {
    __audio: SoundEvent[]
  }
}

/**
 * Runs in the page before the app: records each Web Audio source started or
 * stopped. It can tell which sound played, not how it sounded.
 */
/* eslint-disable @typescript-eslint/unbound-method -- each original is applied with the node as this */
export function recordSounds(): void {
  window.__audio = []
  const log = (e: Omit<SoundEvent, "at">) => window.__audio.push({ ...e, at: performance.now() })
  // Decoded lengths can differ by a frame or two.
  const LENGTHS: Record<string, number> = {
    spray: 26.38,
    eraser: 4.58,
    countdown: 12.5,
    chicken: 2.75,
    clear: 0.45,
    applause: 2.89
  }
  const clipOf = (b: AudioBuffer | null) =>
    !b ? null : (Object.entries(LENGTHS).find(([, len]) => Math.abs(b.duration - len) < 0.06)?.[0] ?? "other")
  const bufferStart = AudioBufferSourceNode.prototype.start
  AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...args) {
    log({ kind: "buffer", clip: clipOf(this.buffer) })
    bufferStart.apply(this, args)
  }
  const bufferStop = AudioBufferSourceNode.prototype.stop
  AudioBufferSourceNode.prototype.stop = function (this: AudioBufferSourceNode, ...args) {
    log({ kind: "stop", clip: clipOf(this.buffer) })
    bufferStop.apply(this, args)
  }
  const oscStart = OscillatorNode.prototype.start
  OscillatorNode.prototype.start = function (this: OscillatorNode, ...args) {
    log({ kind: "osc", freq: Math.round(this.frequency.value) })
    oscStart.apply(this, args)
  }
}
/* eslint-enable @typescript-eslint/unbound-method */

/** The page clock, to time sounds against. */
export function pageTime(tab: Tab): Promise<number> {
  return tab.page.evaluate(() => performance.now())
}

/** The sounds recorded since the last call. */
export function takeSounds(tab: Tab): Promise<SoundEvent[]> {
  return tab.page.evaluate(() => window.__audio.splice(0))
}

export const played = (events: SoundEvent[], clip: string): boolean =>
  events.some((e) => e.kind === "buffer" && e.clip === clip)

export const stopped = (events: SoundEvent[], clip: string): boolean =>
  events.some((e) => e.kind === "stop" && e.clip === clip)

/** The notes of the round cues (the countdown's own beeps are higher). */
export const cueNotes = (events: SoundEvent[]): number[] =>
  events.filter((e) => e.kind === "osc" && (e.freq ?? 0) < 1500).map((e) => e.freq ?? 0)
