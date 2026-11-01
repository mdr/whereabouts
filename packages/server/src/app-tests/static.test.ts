import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { createApp, type App } from "../app.ts"

describe("static serving", () => {
  let app: App
  let base: string
  let directory: string

  beforeEach(async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const path = await import("node:path")
    directory = mkdtempSync(path.join(tmpdir(), "wa-static-"))
    mkdirSync(path.join(directory, "assets"))
    writeFileSync(path.join(directory, "index.html"), "<!doctype html><title>t</title>")
    writeFileSync(path.join(directory, "assets", "index-abc123.js"), "export {};")
    app = createApp({ staticDir: directory, logLevel: "warning" })
    base = await app.listen(0)
  })
  afterEach(async () => {
    await app.close()
  })

  it("serves the bundle immutable and index.html with revalidation, and falls back for app routes", async () => {
    const asset = await fetch(`${base}/assets/index-abc123.js`)
    expect(asset.status).toBe(200)
    expect(asset.headers.get("content-type")).toContain("javascript")
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")

    const index = await fetch(`${base}/`)
    expect(index.headers.get("cache-control")).toBe("no-cache")
    expect(index.headers.has("etag")).toBe(false)
    expect(index.headers.has("last-modified")).toBe(false)

    const fallback = await fetch(`${base}/some/app/route`)
    expect(fallback.status).toBe(200)
    expect(fallback.headers.get("content-type")).toContain("text/html")
    expect(fallback.headers.get("cache-control")).toBe("no-cache")
  })

  it("answers 404 for an asset this build does not have, as for an old tab after a deploy", async () => {
    expect((await fetch(`${base}/assets/regions-old.json`)).status).toBe(404)
  })
})
