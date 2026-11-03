import type { Instant, Ms } from "./units.ts"
import type { TimeoutHandle } from "./timeout.ts"

/** Injected clock so tests can drive time. */
export interface Clock {
  now(): Instant
  setTimeout(callback: () => void, delay: Ms): unknown
  clearTimeout(handle: unknown): void
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (handle) => clearTimeout(handle as TimeoutHandle)
}
