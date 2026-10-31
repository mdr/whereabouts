import { describe, expect, it } from "vite-plus/test"
import { styleLayerPaint, type StyleLayer } from "./map-theme"
import { THEME } from "./themes"

function makeLayer(overrides: Partial<StyleLayer> = {}): StyleLayer {
  return { id: "x", type: "fill", sourceLayer: "", ...overrides }
}

describe("styleLayerPaint", () => {
  it("colours the background with the land", () => {
    const layer = makeLayer({ id: "background", type: "background" })
    expect(styleLayerPaint(layer, THEME)).toEqual([["background", "background-color", THEME.land]])
  })

  it("colours water, wood and other landcover separately", () => {
    expect(styleLayerPaint(makeLayer({ id: "water" }), THEME)).toEqual([["water", "fill-color", THEME.water]])
    expect(styleLayerPaint(makeLayer({ id: "landcover_wood" }), THEME)).toEqual([
      ["landcover_wood", "fill-color", THEME.wood]
    ])
    expect(styleLayerPaint(makeLayer({ id: "landcover_glacier" }), THEME)).toEqual([
      ["landcover_glacier", "fill-color", THEME.ice]
    ])
  })

  it("colours a waterway line but gives its label the label colours", () => {
    const line = makeLayer({ id: "waterway", type: "line", sourceLayer: "waterway" })
    expect(styleLayerPaint(line, THEME)).toEqual([["waterway", "line-color", THEME.waterway]])
    const label = makeLayer({ id: "waterway_line_label", type: "symbol", sourceLayer: "waterway" })
    expect(styleLayerPaint(label, THEME)).toEqual([
      ["waterway_line_label", "text-color", THEME.labelText],
      ["waterway_line_label", "text-halo-color", THEME.labelHalo]
    ])
  })

  it("colours roads by whether the layer is a line or a fill", () => {
    const line = makeLayer({ id: "road", type: "line", sourceLayer: "transportation" })
    expect(styleLayerPaint(line, THEME)).toEqual([["road", "line-color", THEME.road]])
    const fill = makeLayer({ id: "plaza", type: "fill", sourceLayer: "transportation" })
    expect(styleLayerPaint(fill, THEME)).toEqual([["plaza", "fill-color", THEME.road]])
  })

  it("outlines buildings but only fills other urban layers", () => {
    const building = makeLayer({ id: "building", sourceLayer: "building" })
    expect(styleLayerPaint(building, THEME)).toEqual([
      ["building", "fill-color", THEME.urban],
      ["building", "fill-outline-color", THEME.urban]
    ])
    const park = makeLayer({ id: "park", sourceLayer: "park" })
    expect(styleLayerPaint(park, THEME)).toEqual([["park", "fill-color", THEME.urban]])
  })

  it("leaves other layers alone", () => {
    const border = makeLayer({ id: "boundary_2", type: "line", sourceLayer: "boundary" })
    expect(styleLayerPaint(border, THEME)).toEqual([])
  })
})
