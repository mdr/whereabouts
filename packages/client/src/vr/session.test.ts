// @vitest-environment happy-dom
import { SessionMode, VisibilityState } from "@iwsdk/core"
import { signal } from "@preact/signals"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { headsetPassthrough } from "../settings/settings"
import { HeadsetSession, SWITCH_TIMEOUT } from "./session"

function makeSession() {
  const visibilityState = signal(VisibilityState.NonImmersive)
  const world = { visibilityState, launchXR: vi.fn(), exitXR: vi.fn() }
  const hooks = { launching: vi.fn(), ended: vi.fn() }
  const session = new HeadsetSession(world, hooks)
  return { session, visibilityState, world, hooks }
}

function makeImmersive() {
  const made = makeSession()
  made.visibilityState.value = VisibilityState.Visible
  return made
}

beforeEach(() => {
  headsetPassthrough.value = false
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("HeadsetSession", () => {
  it("is active while immersive, and says so once when it ends", () => {
    const { session, visibilityState, hooks } = makeSession()
    expect(session.active.value).toBe(false)
    visibilityState.value = VisibilityState.Visible
    expect(session.active.value).toBe(true)
    visibilityState.value = VisibilityState.NonImmersive
    expect(session.active.value).toBe(false)
    expect(hooks.ended).toHaveBeenCalledTimes(1)
  })

  it("launches the kind of session the setting asks for", () => {
    const { session, world, hooks } = makeSession()
    headsetPassthrough.value = true
    session.launch()
    expect(hooks.launching).toHaveBeenCalledWith(true)
    expect(world.launchXR).toHaveBeenCalledWith({ sessionMode: SessionMode.ImmersiveAR })
  })

  it("exits only while active", () => {
    const idle = makeSession()
    idle.session.exit()
    expect(idle.world.exitXR).not.toHaveBeenCalled()
    const immersive = makeImmersive()
    immersive.session.exit()
    expect(immersive.world.exitXR).toHaveBeenCalledTimes(1)
  })

  describe("switching passthrough", () => {
    it("exits the session, and ignores a second toggle before it settles", () => {
      const { session, world } = makeImmersive()
      session.togglePassthrough()
      session.togglePassthrough()
      expect(world.exitXR).toHaveBeenCalledTimes(1)
    })

    it("opens the other kind once the first has closed, staying active", () => {
      const { session, visibilityState, world, hooks } = makeImmersive()
      session.togglePassthrough()
      visibilityState.value = VisibilityState.NonImmersive
      expect(hooks.launching).toHaveBeenCalledWith(true)
      expect(world.launchXR).toHaveBeenCalledWith({ sessionMode: SessionMode.ImmersiveAR })
      expect(session.active.value).toBe(true)
      expect(hooks.ended).not.toHaveBeenCalled()
      visibilityState.value = VisibilityState.Visible
      expect(headsetPassthrough.value).toBe(true)
      expect(session.active.value).toBe(true)
    })

    it("gives up on a refused switch, keeping the setting", () => {
      const { session, visibilityState, hooks } = makeImmersive()
      session.togglePassthrough()
      visibilityState.value = VisibilityState.NonImmersive
      vi.advanceTimersByTime(SWITCH_TIMEOUT)
      expect(hooks.ended).toHaveBeenCalledTimes(1)
      expect(session.active.value).toBe(false)
      expect(headsetPassthrough.value).toBe(false)
    })
  })
})
