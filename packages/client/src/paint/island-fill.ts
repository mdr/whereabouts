/**
 * The Fill tool's islands, on an island round: the landmass under the
 * pointer (islands.json), filled as a country is. An island round's answer
 * is the same polygon, so filling the right island scores about 999.
 */
import { countryFill, FillShapeType, type FillShape } from "@whereabouts/shared/paint/fill"
import type { H3Cell, H3Resolution } from "@whereabouts/shared/h3"
import { boxAround, inBox, insidePolygon, type Box, type LatLon, type Polygon } from "@whereabouts/shared/geo"
import { FillType, type FillTarget, type Filler } from "./fill-target"

interface Island {
  polygon: Polygon
  box: Box
}

export class IslandFiller implements Filler {
  readonly type = FillType.ISLAND
  private readonly islands: Island[]
  private readonly targets = new Map<Island, FillTarget>()

  constructor(polygons: Polygon[]) {
    this.islands = polygons.map((polygon) => ({ polygon, box: boxAround([polygon]) }))
  }

  /** The island at a point; undefined at sea or on a continent. */
  targetAt(point: LatLon): FillTarget | undefined {
    const island = this.islands.find(({ polygon, box }) => inBox(box, point) && insidePolygon(polygon, point))
    if (!island) return undefined
    let target = this.targets.get(island)
    if (!target) {
      target = islandTarget(`island:${this.islands.indexOf(island)}`, island)
      this.targets.set(island, target)
    }
    return target
  }
}

const islandTarget = (id: string, { polygon, box }: Island): FillTarget => {
  const fills = new Map<H3Resolution, H3Cell[]>()
  const [west, south, east, north] = box
  const shape: FillShape = {
    type: FillShapeType.OUTLINE,
    outline: [polygon],
    answer: { lat: (south + north) / 2, lon: (west + east) / 2 }
  }
  return {
    id,
    outline: { type: "MultiPolygon", coordinates: [polygon] },
    cells: (finestResolution) => {
      let cells = fills.get(finestResolution)
      if (!cells) {
        cells = countryFill(shape, finestResolution)
        fills.set(finestResolution, cells)
      }
      return cells
    }
  }
}
