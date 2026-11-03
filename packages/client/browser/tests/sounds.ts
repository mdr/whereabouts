import { expectPolled, stillTrueFor } from "../pages/support.ts"
import type { Ms } from "@whereabouts/shared/units"
import type { SoundEvent } from "../pages/SoundEvent.ts"
import type { Tab } from "../pages/Tab.ts"

/**
 * Runs in the page before the app: records each Web Audio source started or
 * stopped. It can tell which sound played, not how it sounded.
 */
/* oxlint-disable typescript/unbound-method -- each original is applied with the node as this */
export const recordSounds = (): void => {
  window.__audio = []
  const log = (event: Omit<SoundEvent, "at">) => window.__audio.push({ ...event, at: performance.now() })
  // Decoded lengths can differ by a frame or two.
  const LENGTHS: Record<string, number> = {
    spray: 26.38,
    eraser: 4.58,
    countdown: 12.5,
    chicken: 2.75,
    clear: 0.45,
    applause: 2.89
  }
  const clipOf = (buffer: AudioBuffer | undefined) =>
    !buffer
      ? undefined
      : (Object.entries(LENGTHS).find(([, length]) => Math.abs(buffer.duration - length) < 0.06)?.[0] ?? "other")
  const bufferStart = AudioBufferSourceNode.prototype.start
  AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...args) {
    log({ kind: "buffer", clip: clipOf(this.buffer ?? undefined) })
    bufferStart.apply(this, args)
  }
  const bufferStop = AudioBufferSourceNode.prototype.stop
  AudioBufferSourceNode.prototype.stop = function (this: AudioBufferSourceNode, ...args) {
    log({ kind: "stop", clip: clipOf(this.buffer ?? undefined) })
    bufferStop.apply(this, args)
  }
  const oscStart = OscillatorNode.prototype.start
  OscillatorNode.prototype.start = function (this: OscillatorNode, ...args) {
    log({ kind: "osc", freq: Math.round(this.frequency.value) })
    oscStart.apply(this, args)
  }
}
/* oxlint-enable typescript/unbound-method */

/** The page clock, to time sounds against. */
export const pageTime = (tab: Tab): Promise<number> => tab.pageTime()

const clipsPlayed = (events: SoundEvent[]): string[] =>
  events.filter((event) => event.kind === "buffer").map((event) => event.clip ?? "")

const clipsStopped = (events: SoundEvent[]): string[] =>
  events.filter((event) => event.kind === "stop").map((event) => event.clip ?? "")

/** The notes of the round cues (the countdown's own beeps are higher). */
const cueNotes = (events: SoundEvent[]): number[] =>
  events.filter((event) => event.kind === "osc" && (event.freq ?? 0) < 1500).map((event) => event.freq ?? 0)

/** The sounds one tab records, handed to every window listening to it. */
export class Sounds {
  readonly #tab: Tab
  readonly #windows = new Set<SoundEvent[]>()

  constructor(tab: Tab) {
    this.#tab = tab
  }

  /** Starts a window on what the tab plays from now on. */
  async listen(): Promise<Listening> {
    await this.#drain()
    const events: SoundEvent[] = []
    this.#windows.add(events)
    return new Listening(events, () => this.#drain())
  }

  async #drain(): Promise<void> {
    const fresh = await this.#tab.drainRecordedSounds()
    for (const events of this.#windows) events.push(...fresh)
  }
}

/** The sounds heard since it was opened. */
class Listening {
  readonly #events: SoundEvent[]
  readonly #drain: () => Promise<void>

  constructor(events: SoundEvent[], drain: () => Promise<void>) {
    this.#events = events
    this.#drain = drain
  }

  async #expect<T>(message: string, wanted: string, view: (events: SoundEvent[]) => T, ok: (value: T) => boolean) {
    await expectPolled(
      message,
      wanted,
      async () => {
        await this.#drain()
        return view(this.#events)
      },
      ok
    )
  }

  async #expectHolds<T>(what: string, duration: Ms, view: (events: SoundEvent[]) => T, ok: (value: T) => boolean) {
    await stillTrueFor(
      what,
      duration,
      async () => {
        await this.#drain()
        return view(this.#events)
      },
      ok
    )
  }

  async expectPlayed(clip: string, message: string): Promise<void> {
    await this.#expect(message, `the ${clip} sound`, clipsPlayed, (clips) => clips.includes(clip))
  }

  async expectStopped(clip: string, message: string): Promise<void> {
    await this.#expect(message, `the ${clip} sound stopped`, clipsStopped, (clips) => clips.includes(clip))
  }

  /** The clip does not play for `duration`. */
  async expectNotPlayed(clip: string, duration: Ms = 500): Promise<void> {
    await this.#expectHolds(`the ${clip} sound not playing`, duration, clipsPlayed, (clips) => !clips.includes(clip))
  }

  /** The clip is not stopped for `duration`. */
  async expectNotStopped(clip: string, duration: Ms = 500): Promise<void> {
    await this.#expectHolds(`the ${clip} sound not stopped`, duration, clipsStopped, (clips) => !clips.includes(clip))
  }

  async expectRisingCue(message: string): Promise<void> {
    await this.#expect(
      message,
      "a rising pair of notes",
      cueNotes,
      ([low, high, ...more]) => low !== undefined && high !== undefined && more.length === 0 && low < high
    )
  }

  async expectFallingCue(message: string): Promise<void> {
    await this.#expect(
      message,
      "a falling pair of notes",
      cueNotes,
      ([high, low, ...more]) => high !== undefined && low !== undefined && more.length === 0 && high > low
    )
  }

  /** No falling cue (nor any other round cue) plays for `duration`. */
  async expectNoCue(duration = 500): Promise<void> {
    await this.#expectHolds("no round cue playing", duration, cueNotes, (notes) => notes.length === 0)
  }

  /** The countdown starts once, about `seconds` after `startedAt` on the page clock. */
  async expectCountdownStart(startedAt: number, seconds: number): Promise<void> {
    await this.#expect(
      `the countdown starts about ${seconds} s after Start`,
      "one countdown start",
      (events) =>
        events
          .filter((event) => event.kind === "buffer" && event.clip === "countdown")
          .map((event) => `${((event.at - startedAt) / 1000).toFixed(1)} s`),
      (starts) => starts.length === 1 && Math.abs(Number.parseFloat(starts[0]!) - seconds) < 1
    )
  }

  /** Nothing is played for `duration`. */
  async expectSilent(duration = 300): Promise<void> {
    await this.#expectHolds("no sound playing", duration, clipsPlayed, (clips) => clips.length === 0)
  }
}
