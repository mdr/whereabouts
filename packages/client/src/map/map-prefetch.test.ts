// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import type * as MapPrefetch from "./map-prefetch"

vi.mock("./map", () => ({ STYLE_URL: "https://tiles.example/style", mapWorkerUrl: "/worker.js" }))

const freshPrefetch = async (): Promise<typeof MapPrefetch> => {
  vi.resetModules()
  return import("./map-prefetch")
}

const STYLE = {
  version: 8,
  sources: { world: { type: "vector", url: "https://tiles.example/world.json" } },
  layers: [{ id: "land", type: "fill", source: "world" }]
}

const respond = (url: string): Response => {
  if (url.endsWith("/style")) return Response.json(STYLE)
  if (url.endsWith("world.json")) return Response.json({ tiles: ["https://tiles.example/{z}/{x}/{y}.pbf"] })
  return new Response("tile")
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("prefetchMap", () => {
  it("fetches the map's worker, style and world tiles once, then says it is done", async () => {
    const fetch = vi.fn((url: string) => Promise.resolve(respond(url)))
    vi.stubGlobal("fetch", fetch)
    const { prefetchMap, mapPrefetched } = await freshPrefetch()
    prefetchMap()
    prefetchMap()
    await vi.waitFor(() => expect(mapPrefetched.value).toBe(true))
    const urls = fetch.mock.calls.map(([url]) => url)
    expect(urls).toContain("/worker.js")
    expect(urls).toContain("https://tiles.example/style")
    expect(urls.some((url) => url.endsWith(".pbf"))).toBe(true)
    expect(new Set(urls).size).toBe(urls.length)
  })

  it("is done even when every fetch fails, so what the lobby fetches next is not held up", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("offline")))
    )
    const { prefetchMap, mapPrefetched } = await freshPrefetch()
    prefetchMap()
    await vi.waitFor(() => expect(mapPrefetched.value).toBe(true))
  })

  it("fetches nothing where the player asked to save data", async () => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    vi.stubGlobal("navigator", { connection: { saveData: true } })
    const { prefetchMap, mapPrefetched } = await freshPrefetch()
    prefetchMap()
    expect(mapPrefetched.value).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })
})
