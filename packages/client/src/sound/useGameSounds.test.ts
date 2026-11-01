// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { renderHook } from "@testing-library/preact"
import { Phase } from "@whereabouts/shared/protocol"
import type { Instant, Ms } from "@whereabouts/shared/units"
import { Chime } from "./sound"
import { useGameSounds } from "./useGameSounds"

const sound = vi.hoisted(() => ({
  chime: vi.fn(),
  play: vi.fn(),
  scheduleCountdown: vi.fn(),
  stopCountdown: vi.fn(),
  stopAll: vi.fn()
}))

vi.mock("./sound", async (original) => ({ ...(await original<object>()), sound }))

type View = Parameters<typeof useGameSounds>[1]

const DEADLINE: Instant = 60_000
const guessing = (index = 0): View => ({ phase: Phase.GUESSING, round: { index, deadline: DEADLINE } })
const reveal = (index = 0): View => ({ phase: Phase.REVEAL, reveal: { index } })
const results: View = { phase: Phase.RESULTS }

function setup(first: View) {
  let now: Instant = 0
  const conn = { timeUntil: (at: Instant): Ms => at - now }
  const hook = renderHook((v: View) => useGameSounds(conn, v), { initialProps: first })
  const at = (time: Instant, view: View) => {
    now = time
    hook.rerender(view)
  }
  return { hook, at }
}

beforeEach(() => vi.clearAllMocks())

describe("useGameSounds", () => {
  it("cues nothing for the view a refresh lands on, but times its countdown", () => {
    setup(guessing())
    expect(sound.chime).not.toHaveBeenCalled()
    expect(sound.scheduleCountdown).toHaveBeenCalledWith(DEADLINE)
  })

  it("chimes up as a round starts", () => {
    const { at } = setup({ phase: Phase.LOBBY })
    at(0, guessing())
    expect(sound.chime).toHaveBeenCalledWith(Chime.RISING)
  })

  it("stops the countdown and chimes down when everyone finishes early", () => {
    const { at } = setup({ phase: Phase.LOBBY })
    at(0, guessing())
    at(30_000, reveal())
    expect(sound.stopCountdown).toHaveBeenCalledTimes(1)
    expect(sound.chime).toHaveBeenLastCalledWith(Chime.FALLING)
  })

  it("lets the alarm play when the round runs out of time", () => {
    const { at } = setup({ phase: Phase.LOBBY })
    at(0, guessing())
    at(DEADLINE, reveal())
    expect(sound.stopCountdown).not.toHaveBeenCalled()
    expect(sound.chime).not.toHaveBeenCalledWith(Chime.FALLING)
  })

  it("stops the countdown and applauds at the final results", () => {
    const { at } = setup(guessing())
    at(30_000, results)
    expect(sound.stopCountdown).toHaveBeenCalled()
    expect(sound.play).toHaveBeenCalledWith("applause")
  })

  it("silences everything when the game screen goes", () => {
    setup(guessing()).hook.unmount()
    expect(sound.stopAll).toHaveBeenCalled()
  })
})
