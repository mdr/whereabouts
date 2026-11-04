// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vite-plus/test"
import { fetchBuildJson, reloadForNewBuild } from "./stale-build"

let reload: Mock

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000_000)
  sessionStorage.clear()
  reload = vi.fn()
  vi.stubGlobal("location", { reload })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("reloadForNewBuild", () => {
  it("reloads, but not again within a minute, so a file truly missing cannot loop", () => {
    expect(reloadForNewBuild()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(59_999)
    expect(reloadForNewBuild()).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(reloadForNewBuild()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it("does not reload where session storage is refused, since it could not stop a loop", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("denied")
      }
    })
    expect(reloadForNewBuild()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})

/** The error fetchBuildJson fails with, once its retries have run. */
const failureOf = async (url: string): Promise<unknown> => {
  const failed = fetchBuildJson(url).then(
    () => undefined,
    (error: unknown) => error
  )
  await vi.runAllTimersAsync()
  return failed
}

describe("fetchBuildJson", () => {
  it("reloads for a file this build no longer has, still failing the fetch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })))
    expect(await failureOf("/data.json")).toEqual(new Error("/data.json: 404"))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("does not reload for a server error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })))
    expect(await failureOf("/data.json")).toEqual(new Error("/data.json: 503"))
    expect(reload).not.toHaveBeenCalled()
  })
})
