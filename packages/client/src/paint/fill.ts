/**
 * The Fill tool's countries: which one is under the pointer, its outline to
 * highlight, and the cells that fill it (see fill.ts in shared). A country
 * scored as a shape is filled with the very outline it is scored by, so
 * filling the right one scores about 999; any other with its land from
 * borders.json. Needs the borders and the countries loaded (useFillTool loads them).
 */
import { useEffect } from "preact/hooks"
import { countryFill, FillShapeType, type FillShape } from "@whereabouts/shared/paint/fill"
import type { Borders } from "@whereabouts/shared/borders"
import type { FlagCode } from "@whereabouts/shared/ids"
import type { H3Cell, H3Res } from "@whereabouts/shared/h3"
import { AnswerType, answerCentre, type FlagQuestion, type Outlines } from "@whereabouts/shared/questions"
import { kmToDegrees, type LatLon, type MultiPolygon, type Ring } from "@whereabouts/shared/geo"
import type { PaintController } from "./paint-controller"
import { useBorders } from "../data/borders"
import { useOutlines } from "../data/outlines"
import type { Km } from "@whereabouts/shared/units"

export class CountryFiller {
  private readonly shapes = new Map<FlagCode, FillShape>()
  private readonly cursors = new Map<FlagCode, GeoJSON.MultiPolygon>()
  private readonly fills = new Map<string, H3Cell[]>()

  private readonly borders: Borders
  private readonly outlines: Outlines

  constructor(borders: Borders, outlines: Outlines) {
    this.borders = borders
    this.outlines = outlines
  }

  /**
   * The country at a point, or undefined (at sea, or where no country is named);
   * failing that, a small country within `reach`.
   */
  countryAt(p: LatLon, reach: Km): FlagQuestion | undefined {
    return this.borders.countryAt(p) ?? this.borders.smallNear(p, reach)
  }

  /** The country's outline, for the cursor. */
  outline(f: FlagQuestion): GeoJSON.MultiPolygon {
    let o = this.cursors.get(f.clue.flag)
    if (!o) {
      const shape = this.shape(f)
      const coordinates: MultiPolygon =
        shape.type === FillShapeType.OUTLINE ? shape.outline : shape.rings.map((r) => [r])
      // A country too small for land of its own shows as its answer's surroundings.
      o = {
        type: "MultiPolygon",
        coordinates: coordinates.length > 0 ? coordinates : [[circle(answerCentre(f.answer), shape.near ?? 5)]]
      }
      this.cursors.set(f.clue.flag, o)
    }
    return o
  }

  /** The cells filling the country on a layer of this finest resolution, compacted. */
  cells(f: FlagQuestion, finestRes: H3Res): H3Cell[] {
    const key = `${f.clue.flag}:${finestRes}`
    let cells = this.fills.get(key)
    if (!cells) {
      cells = countryFill(this.shape(f), finestRes)
      this.fills.set(key, cells)
    }
    return cells
  }

  private shape(f: FlagQuestion): FillShape {
    let shape = this.shapes.get(f.clue.flag)
    if (!shape) {
      const outline = f.answer.type === AnswerType.AREA ? this.outlines.get(f.answer.outline) : undefined
      shape = outline
        ? { type: FillShapeType.OUTLINE, outline, answer: answerCentre(f.answer) }
        : this.borders.fillShape(f)
      this.shapes.set(f.clue.flag, shape)
    }
    return shape
  }
}

/** A ring of `km` around a point, [lon, lat], for outlining a speck of a country. */
function circle({ lat, lon }: LatLon, km: Km): Ring {
  const dLat = kmToDegrees(km)
  const dLon = dLat / Math.max(0.01, Math.cos((lat * Math.PI) / 180))
  const ring: Ring = []
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
export function useFillTool(paint: Pick<PaintController, "useFiller" | "offerFill">, active: boolean): void {
  const b = useBorders(active)
  const r = useOutlines(active)
  useEffect(() => {
    if (b && r) paint.useFiller(new CountryFiller(b, r))
    paint.offerFill(active)
  }, [paint, active, b, r])
  useEffect(() => () => paint.offerFill(false), [paint])
}
