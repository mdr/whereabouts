/**
 * What a MapLibre style fetches to draw the whole world, worked out from the
 * style itself: its sprite, the Latin glyphs of the labels shown at that
 * zoom, and the tiles of the sources those layers draw from.
 */
import type { LayerSpecification, StyleSpecification } from "maplibre-gl"

export interface StyleFetches {
  /** Fetched as they are. */
  urls: string[]
  /** TileJSON documents, whose tile templates `tileUrls` then fills in. */
  tileJsons: string[]
}

export function styleFetches(style: StyleSpecification, zoom: number, pixelRatio: number): StyleFetches {
  // A phone's whole world is below zoom 0, but its tiles are drawn at 0.
  const z = tileZoom(zoom)
  const shown = style.layers.filter((l) => (l.minzoom ?? 0) <= z && l.layout?.visibility !== "none")
  const urls: string[] = []
  const tileJsons: string[] = []
  for (const id of new Set(shown.map(sourceOf))) {
    const source = id === undefined ? undefined : style.sources[id]
    if (source?.type !== "vector" && source?.type !== "raster") continue
    if (source.tiles) urls.push(...tileUrls(source.tiles, zoom))
    else if (source.url) tileJsons.push(source.url)
  }
  const ratio = pixelRatio > 1 ? "@2x" : ""
  for (const sprite of typeof style.sprite === "string" ? [style.sprite] : (style.sprite ?? []).map((s) => s.url))
    urls.push(`${sprite}${ratio}.json`, `${sprite}${ratio}.png`)
  if (style.glyphs) {
    const fonts = new Set(shown.flatMap((l) => fontOf(l) ?? []))
    for (const font of fonts)
      urls.push(style.glyphs.replace("{fontstack}", encodeURIComponent(font)).replace("{range}", "0-255"))
  }
  return { urls, tileJsons }
}

/** Every tile at the zoom MapLibre draws `zoom` with (512 px tiles: the zoom rounded down). */
export function tileUrls(templates: string[], zoom: number): string[] {
  const z = tileZoom(zoom)
  const n = 2 ** z
  const template = templates[0]
  if (template === undefined) return []
  const urls: string[] = []
  for (let x = 0; x < n; x++)
    for (let y = 0; y < n; y++)
      urls.push(template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)))
  return urls
}

const tileZoom = (zoom: number): number => Math.max(0, Math.floor(zoom))

function sourceOf(layer: LayerSpecification): string | undefined {
  return "source" in layer && typeof layer.source === "string" ? layer.source : undefined
}

/** A symbol layer's font stack, as MapLibre names it in glyph URLs; undefined when it is an expression. */
function fontOf(layer: LayerSpecification): string | undefined {
  if (layer.type !== "symbol") return undefined
  const font: unknown = layer.layout?.["text-font"]
  return Array.isArray(font) && font.every((f) => typeof f === "string") ? font.join(",") : undefined
}
