import { describe, expect, it } from "vite-plus/test"
import { styleLayerPaint, type StyleLayer } from "./map-theme"
import { THEME } from "./themes"

function makeLayer(overrides: Partial<StyleLayer> = {}): StyleLayer {
  return { id: "x", type: "fill", sourceLayer: "", ...overrides }
}

describe("styleLayerPaint", () => {
  it("colours the background with the land", () => {
    const layer = makeLayer({ id: "background", type: "background" })
    expect(styleLayerPaint(layer, THEME)).toEqual([
      { layer: "background", property: "background-color", value: THEME.land }
    ])
  })

  it("colours water, wood and other landcover separately", () => {
    expect(styleLayerPaint(makeLayer({ id: "water" }), THEME)).toEqual([
      { layer: "water", property: "fill-color", value: THEME.water }
    ])
    expect(styleLayerPaint(makeLayer({ id: "landcover_wood" }), THEME)).toEqual([
      { layer: "landcover_wood", property: "fill-color", value: THEME.wood }
    ])
    expect(styleLayerPaint(makeLayer({ id: "landcover_glacier" }), THEME)).toEqual([
      { layer: "landcover_glacier", property: "fill-color", value: THEME.ice }
    ])
  })

  it("colours a waterway line but gives its label the label colours", () => {
    const line = makeLayer({ id: "waterway", type: "line", sourceLayer: "waterway" })
    expect(styleLayerPaint(line, THEME)).toEqual([{ layer: "waterway", property: "line-color", value: THEME.waterway }])
    const label = makeLayer({ id: "waterway_line_label", type: "symbol", sourceLayer: "waterway" })
    expect(styleLayerPaint(label, THEME)).toEqual([
      { layer: "waterway_line_label", property: "text-color", value: THEME.labelText },
      { layer: "waterway_line_label", property: "text-halo-color", value: THEME.labelHalo }
    ])
  })

  it("colours roads by whether the layer is a line or a fill", () => {
    const line = makeLayer({ id: "road", type: "line", sourceLayer: "transportation" })
    expect(styleLayerPaint(line, THEME)).toEqual([{ layer: "road", property: "line-color", value: THEME.road }])
    const fill = makeLayer({ id: "plaza", type: "fill", sourceLayer: "transportation" })
    expect(styleLayerPaint(fill, THEME)).toEqual([{ layer: "plaza", property: "fill-color", value: THEME.road }])
  })

  it("outlines buildings but only fills other urban layers", () => {
    const building = makeLayer({ id: "building", sourceLayer: "building" })
    expect(styleLayerPaint(building, THEME)).toEqual([
      { layer: "building", property: "fill-color", value: THEME.urban },
      { layer: "building", property: "fill-outline-color", value: THEME.urban }
    ])
    const park = makeLayer({ id: "park", sourceLayer: "park" })
    expect(styleLayerPaint(park, THEME)).toEqual([{ layer: "park", property: "fill-color", value: THEME.urban }])
  })

  it("leaves other layers alone", () => {
    const border = makeLayer({ id: "boundary_2", type: "line", sourceLayer: "boundary" })
    expect(styleLayerPaint(border, THEME)).toEqual([])
  })
})
