import { describe, expect, it } from "vite-plus/test"
import { indexStyle, type IndexedLayer } from "./style-index"

const layers: IndexedLayer[] = [
  { id: "background", type: "background" },
  { id: "water", type: "fill", "source-layer": "water" },
  { id: "waterway", type: "line", "source-layer": "waterway" },
  { id: "landcover_wood", type: "fill", "source-layer": "landcover" },
  { id: "landcover_ice_shelf", type: "fill", "source-layer": "landcover" },
  { id: "park", type: "fill", "source-layer": "park" },
  { id: "road_motorway", type: "line", "source-layer": "transportation" },
  { id: "boundary_2", type: "line", "source-layer": "boundary" },
  { id: "boundary_3", type: "line", "source-layer": "boundary" },
  { id: "label_city", type: "symbol", "source-layer": "place" }
]

const index = () =>
  indexStyle(
    layers,
    (id) => ({ width: id.length, opacity: 0.5 }),
    (id) => ["==", "id", id]
  )

describe("indexStyle", () => {
  it("sorts layers by what the detail toggles", () => {
    const sorted = index()
    expect(sorted.labels).toEqual(["label_city"])
    expect(sorted.borders).toEqual(["boundary_2", "boundary_3"])
    expect(sorted.roads).toEqual(["road_motorway"])
    expect(sorted.urban).toEqual(["park"])
    expect(sorted.waterways).toEqual(["waterway"])
    expect(sorted.wood).toEqual(["landcover_wood"])
    expect(sorted.ice).toEqual(["landcover_ice_shelf"])
    expect(sorted.styleLayers).toHaveLength(layers.length)
  })

  it("keeps the style's own paint for national borders only", () => {
    expect([...index().nationalBorderPaint.keys()]).toEqual(["boundary_2"])
  })

  it("remembers the water layer's filter", () => {
    expect(index().waterFilter).toEqual(["==", "id", "water"])
  })
})
