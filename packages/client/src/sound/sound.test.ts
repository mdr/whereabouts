// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { countdownPlan, sound } from "./sound"

describe("countdownPlan", () => {
  it("waits until ten seconds are left, then plays from the start", () => {
    expect(countdownPlan(60_000)).toEqual({ delay: 50_000, offset: 0 })
    expect(countdownPlan(10_000)).toEqual({ delay: 0, offset: 0 })
  })

  it("joins partway when arriving with less than ten seconds left, so the alarm still lands on zero", () => {
    expect(countdownPlan(6_000)).toEqual({ delay: 0, offset: 4 })
    expect(countdownPlan(500)).toEqual({ delay: 0, offset: 9.5 })
  })

  it("plays nothing once time is up", () => {
    expect(countdownPlan(0)).toBeUndefined()
    expect(countdownPlan(-200)).toBeUndefined()
  })
})

describe("unlocking audio", () => {
  afterEach(() => vi.unstubAllGlobals())

  // iPad Safari can hand back a context that is "interrupted" rather than
  // "suspended"; audio stayed silent until taps retried from that state too.
  it("asks a context that is not running to resume, on every tap, whatever Safari calls its state", () => {
    const resume = vi.fn(() => Promise.resolve())
    class FakeContext {
      state = "interrupted"
      destination = {}
      resume = resume
      createGain(): { connect(): void } {
        return { connect() {} }
      }
    }
    vi.stubGlobal("AudioContext", FakeContext)
    vi.stubGlobal("fetch", () => new Promise(() => {}))
    sound.unlock()
    sound.unlock()
    expect(resume).toHaveBeenCalledTimes(2)
  })
})
