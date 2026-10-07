/**
 * The Fill tool's countries: which one is under the pointer, its outline to
 * highlight, and the cells that fill it (see fill.ts in shared). A country
 * scored as a shape is filled with the very outline it is scored by, so
 * filling the right one scores about 999; any other with its land from
 * borders.json. Needs the borders and the countries loaded (loadBorders).
 */
import { useEffect } from "preact/hooks"
import {
  countryFill,
  type Borders,
  type FillShape,
  type FlagQuestion,
  type LatLon,
  type RegionQuestion
} from "@whereabouts/shared"
import type { PaintController } from "./paint-controller"
import { borders, loadBorders } from "./borders"
import { regions } from "./regions"

export class CountryFiller {
  private readonly shapes = new Map<string, FillShape>()
  private readonly outlines = new Map<string, GeoJSON.MultiPolygon>()
  private readonly fills = new Map<string, string[]>()

  private readonly borders: Borders
  private readonly regions: ReadonlyMap<string, RegionQuestion>

  constructor(borders: Borders, regions: ReadonlyMap<string, RegionQuestion>) {
    this.borders = borders
    this.regions = regions
  }

  /**
   * The country at a point, or null (at sea, or where no country is named);
   * failing that, a small country within `px` pixels at `kmPerPx`.
   */
  countryAt(p: LatLon, kmPerPx: number, px: number): FlagQuestion | null {
    return this.borders.countryAt(p) ?? this.borders.smallNear(p, kmPerPx, px)
  }

  /** The country's outline, for the cursor. */
  outline(f: FlagQuestion): GeoJSON.MultiPolygon {
    let o = this.outlines.get(f.flag)
    if (!o) {
      const shape = this.shape(f)
      const coordinates = shape.polygons ?? (shape.rings ?? []).map((r) => [r])
      // A country too small for land of its own shows as its answer's surroundings.
      o = {
        type: "MultiPolygon",
        coordinates: coordinates.length > 0 ? coordinates : [[circle(f.answer, shape.near ?? 5)]]
      }
      this.outlines.set(f.flag, o)
    }
    return o
  }

  /** The cells filling the country on a layer of this finest resolution, compacted. */
  cells(f: FlagQuestion, finestRes: number): string[] {
    const key = `${f.flag}:${finestRes}`
    let cells = this.fills.get(key)
    if (!cells) {
      cells = countryFill(this.shape(f), finestRes)
      this.fills.set(key, cells)
    }
    return cells
  }

  private shape(f: FlagQuestion): FillShape {
    let shape = this.shapes.get(f.flag)
    if (!shape) {
      const region = f.regionId ? this.regions.get(f.regionId) : undefined
      shape = region ? { polygons: region.outline, answer: f.answer } : this.borders.fillShape(f)
      this.shapes.set(f.flag, shape)
    }
    return shape
  }
}

/** A ring of `km` around a point, [lon, lat], for outlining a speck of a country. */
function circle({ lat, lon }: LatLon, km: number): number[][] {
  const dLat = km / 111.32
  const dLon = dLat / Math.max(0.01, Math.cos((lat * Math.PI) / 180))
  const ring: number[][] = []
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * 2 * Math.PI
    ring.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)])
  }
  return ring
}

/**
 * Offer the Fill tool while `active` (a round asking for a country, on the
 * Political map): load the countries if need be, and hand them to the paint
 * controller.
 */
export function useFillTool(paint: PaintController, active: boolean): void {
  const b = borders.value
  const r = regions.value
  useEffect(() => {
    if (active && !b) loadBorders().catch((err: unknown) => console.warn("could not load borders", err))
  }, [active, b])
  useEffect(() => {
    if (b && r && !paint.filler) paint.filler = new CountryFiller(b, r)
    paint.fillable.value = active && paint.filler !== null
  }, [paint, active, b, r])
  useEffect(() => () => void (paint.fillable.value = false), [paint])
}
