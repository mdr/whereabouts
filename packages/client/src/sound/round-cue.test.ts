import { describe, expect, it } from "vite-plus/test"
import { Phase } from "@whereabouts/shared/protocol/views"
import { RoundCue, roundCue } from "./round-cue"

describe("roundCue", () => {
  const lobby = { phase: Phase.LOBBY, round: undefined }
  const guessing = (round: number): { phase: Phase; round: number } => ({ phase: Phase.GUESSING, round })
  const reveal = (round: number): { phase: Phase; round: number } => ({ phase: Phase.REVEAL, round })

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
