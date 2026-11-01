import { describe, expect, it } from "vite-plus/test"
import type { LayerSpecification, StyleSpecification } from "maplibre-gl"
import { styleFetches, tileUrls } from "./style-urls"

const makeStyle = (extra: Partial<StyleSpecification> = {}): StyleSpecification => ({
  version: 8,
  sources: {
    vector: { type: "vector", url: "https://tiles/planet" },
    raster: { type: "raster", tiles: ["https://tiles/raster/{z}/{x}/{y}.png"] }
  },
  layers: [],
  ...extra
})

const label = (id: string, font: string[], extra: Partial<LayerSpecification> = {}): LayerSpecification =>
  ({
    id,
    type: "symbol",
    source: "vector",
    "source-layer": "place",
    layout: { "text-font": font },
    ...extra
  }) as LayerSpecification

describe("what a style fetches to show the world", () => {
  it("only the sources that a shown layer draws from", () => {
    const style = makeStyle({
      layers: [
        { id: "land", type: "fill", source: "vector", "source-layer": "land" },
        { id: "relief", type: "raster", source: "raster", layout: { visibility: "none" } }
      ]
    })
    expect(styleFetches(style, 0, 1)).toEqual({ urls: [], tileJsons: ["https://tiles/planet"] })
  })

  it("the tiles of a source that lists them", () => {
    const style = makeStyle({ layers: [{ id: "relief", type: "raster", source: "raster" }] })
    expect(styleFetches(style, 0.4, 1).urls).toEqual(["https://tiles/raster/0/0/0.png"])
  })

  it("the sprite at the screen's pixel ratio", () => {
    const style = makeStyle({ sprite: "https://tiles/sprites/ofm" })
    expect(styleFetches(style, 1, 2).urls).toEqual([
      "https://tiles/sprites/ofm@2x.json",
      "https://tiles/sprites/ofm@2x.png"
    ])
    expect(styleFetches(style, 1, 1).urls).toEqual(["https://tiles/sprites/ofm.json", "https://tiles/sprites/ofm.png"])
  })

  it("the Latin glyphs of each font a label shown at that zoom uses, once", () => {
    const style = makeStyle({
      glyphs: "https://tiles/fonts/{fontstack}/{range}.pbf",
      layers: [
        label("country", ["Noto Sans Bold"]),
        label("sea", ["Noto Sans Italic"]),
        label("capital", ["Noto Sans Bold"]),
        label("town", ["Noto Sans Regular"], { minzoom: 6 })
      ]
    })
    expect(styleFetches(style, 1.6, 1).urls).toEqual([
      "https://tiles/fonts/Noto%20Sans%20Bold/0-255.pbf",
      "https://tiles/fonts/Noto%20Sans%20Italic/0-255.pbf"
    ])
  })
})

describe("the tiles of the whole world", () => {
  it("are every tile at the zoom rounded down", () => {
    expect(tileUrls(["t/{z}/{x}/{y}"], 1.6)).toEqual(["t/1/0/0", "t/1/0/1", "t/1/1/0", "t/1/1/1"])
    expect(tileUrls(["t/{z}/{x}/{y}"], 0.6)).toEqual(["t/0/0/0"])
    expect(tileUrls(["t/{z}/{x}/{y}"], -0.3)).toEqual(["t/0/0/0"])
  })
})
