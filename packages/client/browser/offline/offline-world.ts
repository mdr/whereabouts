/**
 * Answers every request an isolated test's tab sends beyond localhost from
 * offline-world/ (built by scripts/build-offline-world.ts), so *.iwft.ts specs run
 * with no network. A request it has no answer for fails the test.
 */
import { expect, type BrowserContext } from "@playwright/test"
import { existsSync, readFileSync } from "node:fs"

const WORLD = new URL("./offline-world/", import.meta.url).pathname
/** Where the Commons API says a photo is: answered with the stand-in. */
const PHOTO_URL = "https://upload.wikimedia.org/offline/photo.png"

enum ContentType {
  GLB = "model/gltf-binary",
  JSON = "application/json",
  PNG = "image/png",
  PROTOBUF = "application/x-protobuf"
}

interface Answer {
  body: Buffer | string
  contentType: ContentType
}

const file = (path: string, contentType: ContentType): Answer | undefined =>
  existsSync(WORLD + path) ? { body: readFileSync(WORLD + path), contentType } : undefined

const PHOTO = (): Answer | undefined => file("photo.png", ContentType.PNG)

const tilesAnswer = (path: string): Answer | undefined => {
  if (path === "/styles/positron") return file("style.json", ContentType.JSON)
  if (path === "/planet") return file("planet.json", ContentType.JSON)
  const vector = /^\/planet\/offline\/(\d+\/\d+\/\d+\.pbf)$/.exec(path)
  if (vector) return file(`planet/${vector[1]}`, ContentType.PROTOBUF)
  const relief = /^\/natural_earth\/ne2sr\/(\d+\/\d+\/\d+\.png)$/.exec(path)
  if (relief) return file(`ne2sr/${relief[1]}`, ContentType.PNG)
  const sprite = /^\/sprites\/[^/]+\/(ofm(?:@2x)?)\.(json|png)$/.exec(path)
  if (sprite)
    return file(`sprites/${sprite[1]}.${sprite[2]}`, sprite[2] === "json" ? ContentType.JSON : ContentType.PNG)
  const glyphs = /^\/fonts\/([^/]+)\/(\d+-\d+)\.pbf$/.exec(path)
  // Glyph ranges beyond Latin are left out: an empty range draws nothing.
  if (glyphs)
    return (
      file(`fonts/${decodeURIComponent(glyphs[1]!)}/${glyphs[2]}.pbf`, ContentType.PROTOBUF) ?? {
        body: "",
        contentType: ContentType.PROTOBUF
      }
    )
  return undefined
}

const answerFor = ({ host, pathname }: URL): Answer | undefined => {
  switch (host) {
    case "tiles.openfreemap.org":
      return tilesAnswer(pathname)
    case "s3.amazonaws.com":
      return pathname.startsWith("/elevation-tiles-prod/") ? file("flat-terrain.png", ContentType.PNG) : undefined
    case "commons.wikimedia.org":
      if (pathname === "/w/api.php")
        return {
          body: JSON.stringify({ query: { pages: { "1": { imageinfo: [{ thumburl: PHOTO_URL }] } } } }),
          contentType: ContentType.JSON
        }
      return pathname.startsWith("/wiki/Special:FilePath/") || pathname === "/w/index.php" ? PHOTO() : undefined
    case "cdn.jsdelivr.net": {
      const model = /\/meta-quest-touch-plus\/(left|right)\.glb$/.exec(pathname)
      return model ? file(`controllers/${model[1]}.glb`, ContentType.GLB) : undefined
    }
    case "upload.wikimedia.org":
    case "thumb.wikimedia.org":
      return PHOTO()
    default:
      return undefined
  }
}

const isLocal = ({ hostname, protocol }: URL): boolean =>
  hostname === "localhost" || hostname === "127.0.0.1" || !protocol.startsWith("http")

/** Serve the tab's requests beyond localhost from the offline world. */
export const serveOfflineWorld = async (context: BrowserContext): Promise<void> => {
  await context.route(
    (url) => !isLocal(url),
    async (route) => {
      const url = route.request().url()
      const answer = answerFor(new URL(url))
      if (answer) {
        await route.fulfill({
          body: answer.body,
          contentType: answer.contentType,
          headers: { "access-control-allow-origin": "*" }
        })
        return
      }
      expect.soft(undefined, `${url} is outside the offline world: add it to offline-world.ts`).toBeDefined()
      await route.abort("blockedbyclient")
    }
  )
}
