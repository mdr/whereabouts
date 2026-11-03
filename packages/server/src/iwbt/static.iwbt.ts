import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect } from "vite-plus/test"
import { useInProcessServer } from "../test-support/use-in-process-server.ts"

const directory = mkdtempSync(path.join(tmpdir(), "wa-static-"))
mkdirSync(path.join(directory, "assets"))
writeFileSync(path.join(directory, "index.html"), "<!doctype html><title>t</title>")
writeFileSync(path.join(directory, "assets", "index-abc123.js"), "export {};")

describe("static serving", () => {
  const it = useInProcessServer({ staticDir: directory })
  afterAll(() => rmSync(directory, { recursive: true, force: true }))

  it("serves the bundle immutable and index.html with revalidation, and falls back for app routes", async ({
    server
  }) => {
    const base = server.httpUrl
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

  it("answers 404 for an asset this build does not have, as for an old tab after a deploy", async ({ server }) => {
    expect((await fetch(`${server.httpUrl}/assets/regions-old.json`)).status).toBe(404)
  })
})
