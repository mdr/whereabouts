/**
 * Puts what the map downloads to show the world into the browser's cache
 * while players wait in the lobby. On a slow phone those downloads otherwise
 * take seconds of round 1's clock; with them cached the map is ready in a
 * fifth of a second.
 */
import { signal } from "@preact/signals"
import type { StyleSpecification } from "maplibre-gl"
import { STYLE_URL, flatWorldZoom, mapWorkerUrl } from "./map"
import { styleFetches, tileUrls } from "./style-urls"

/** Done, or skipped: what else the lobby fetches waits for this, so as not to slow it. */
export const mapPrefetched = signal(false)

let started = false

export function prefetchMap(): void {
  if (started) return
  started = true
  const connection = (navigator as { connection?: { saveData?: boolean } }).connection
  if (connection?.saveData) {
    mapPrefetched.value = true
    return
  }
  void Promise.all([warm(mapWorkerUrl), warmStyle()]).then(() => (mapPrefetched.value = true))
}

async function warmStyle(): Promise<void> {
  const style = await getJson<StyleSpecification>(STYLE_URL)
  if (!style) return
  const zoom = flatWorldZoom(innerWidth)
  const { urls, tileJsons } = styleFetches(style, zoom, devicePixelRatio)
  await Promise.all([
    ...urls.map(warm),
    ...tileJsons.map(async (url) => {
      const tileJson = await getJson<{ tiles?: string[] }>(url)
      await Promise.all(tileUrls(tileJson?.tiles ?? [], zoom).map(warm))
    })
  ])
}

async function warm(url: string): Promise<void> {
  try {
    await (await fetch(url, { priority: "low" })).arrayBuffer()
  } catch {
    // The map fetches it again when it needs it.
  }
}

async function getJson<T>(url: string): Promise<T | undefined> {
  try {
    const response = await fetch(url, { priority: "low" })
    return response.ok ? ((await response.json()) as T) : undefined
  } catch {
    return undefined
  }
}
