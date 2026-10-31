// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { RoundCue, countdownPlan, roundCue, sound } from "./sound"
import { Phase } from "@whereabouts/shared/protocol"

describe("countdownPlan", () => {
  it("waits until ten seconds are left, then plays from the start", () => {
    expect(countdownPlan(60_000)).toEqual({ delayMs: 50_000, offsetS: 0 })
    expect(countdownPlan(10_000)).toEqual({ delayMs: 0, offsetS: 0 })
  })

  it("joins partway when arriving with less than ten seconds left, so the alarm still lands on zero", () => {
    expect(countdownPlan(6_000)).toEqual({ delayMs: 0, offsetS: 4 })
    expect(countdownPlan(500)).toEqual({ delayMs: 0, offsetS: 9.5 })
  })

  it("plays nothing once time is up", () => {
    expect(countdownPlan(0)).toBeUndefined()
    expect(countdownPlan(-200)).toBeUndefined()
  })
})

describe("roundCue", () => {
  const lobby = { phase: Phase.LOBBY, round: undefined }
  const guessing = (round: number) => ({ phase: Phase.GUESSING, round })
  const reveal = (round: number) => ({ phase: Phase.REVEAL, round })

  it("says nothing on the first view, so a refresh mid-round is not announced", () => {
    expect(roundCue(undefined, guessing(2), 30_000)).toBeUndefined()
  })

  it("cues a round starting, from the lobby or from the reveal", () => {
    expect(roundCue(lobby, guessing(0), 60_000)).toBe(RoundCue.ROUND_START)
    expect(roundCue(reveal(0), guessing(1), 60_000)).toBe(RoundCue.ROUND_START)
  })

  it("cues finishing early when the round ends with time on the clock", () => {
    expect(roundCue(guessing(0), reveal(0), 20_000)).toBe(RoundCue.FINISHED_EARLY)
  })

  it("leaves the alarm to play when the round ends on time", () => {
    expect(roundCue(guessing(0), reveal(0), 100)).toBeUndefined()
    expect(roundCue(guessing(0), reveal(0), -300)).toBeUndefined()
  })

  it("applauds the final results, whether reached from the reveal or by the host ending the game mid-round", () => {
    const results = { phase: Phase.RESULTS, round: undefined }
    expect(roundCue(reveal(1), results, 0)).toBe(RoundCue.RESULTS)
    expect(roundCue(guessing(1), results, 30_000)).toBe(RoundCue.RESULTS)
    expect(roundCue(results, results, 0)).toBeUndefined()
  })

  it("does not applaud a refresh on the results screen", () => {
    expect(roundCue(undefined, { phase: Phase.RESULTS, round: undefined }, 0)).toBeUndefined()
  })

  it("stays quiet for changes within a phase", () => {
    expect(roundCue(guessing(1), guessing(1), 30_000)).toBeUndefined()
    expect(roundCue(reveal(1), reveal(1), 0)).toBeUndefined()
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
      createGain() {
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
