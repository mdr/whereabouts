import type { Instant, Ms } from "../units.ts"
import type { Clock } from "../clock.ts"

/**
 * Real time plus an offset, or a time that moves only when advanced. Timers fire
 * only when `advance` passes them, so a test decides when deadlines come.
 */
export class FakeClock implements Clock {
  offset: Ms = 0
  readonly #frozenAt: Instant | undefined

  constructor({ frozenAt }: { frozenAt?: Instant } = {}) {
    this.#frozenAt = frozenAt
  }

  private pending = new Map<number, { at: Instant; fn: () => void }>()
  private seq = 0
  now(): Instant {
    return (this.#frozenAt ?? Date.now()) + this.offset
  }
  setTimeout(fn: () => void, ms: Ms): number {
    const id = ++this.seq
    this.pending.set(id, { at: this.now() + ms, fn })
    return id
  }
  clearTimeout(handle: unknown): void {
    this.pending.delete(handle as number)
  }
  /** Jump forward and fire everything now due, in order. */
  advance(ms: Ms): void {
    this.offset += ms
    const due = [...this.pending.entries()]
      .filter(([, timer]) => timer.at <= this.now())
      .sort((a, b) => a[1].at - b[1].at)
    for (const [id, timer] of due) {
      this.pending.delete(id)
      timer.fn()
    }
  }
}
