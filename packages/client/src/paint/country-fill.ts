/**
 * The Fill tool's countries: which one is under the pointer, its outline to
 * highlight, and the cells that fill it (see fill.ts in shared). A country
 * scored as a shape is filled with the very outline it is scored by, so
 * filling the right one scores about 999; any other with its land from
 * borders.json. Needs the borders and the countries loaded (useFillTool loads them).
 */
import { countryFill, FillShapeType, type FillShape } from "@whereabouts/shared/paint/fill"
import type { Borders } from "@whereabouts/shared/borders"
import type { FlagCode } from "@whereabouts/shared/ids"
import type { H3Cell, H3Resolution } from "@whereabouts/shared/h3"
import { AnswerType, answerCentre, type FlagQuestion, type Outlines } from "@whereabouts/shared/questions"
import { kmToDegrees, toRadians, type LatLon, type MultiPolygon, type Ring } from "@whereabouts/shared/geo"
import type { Km } from "@whereabouts/shared/units"
import { FillType, type FillTarget, type Filler } from "./fill-target"

/** A country's flag code and the finest resolution it was filled for. */
type FillKey = `${FlagCode}:${H3Resolution}`

export class CountryFiller implements Filler {
  readonly type = FillType.COUNTRY
  private readonly targets = new Map<FlagCode, FillTarget>()
  private readonly shapes = new Map<FlagCode, FillShape>()
  private readonly cursors = new Map<FlagCode, GeoJSON.MultiPolygon>()
  private readonly fills = new Map<FillKey, H3Cell[]>()

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
  countryAt(point: LatLon, reach: Km): FlagQuestion | undefined {
    return this.borders.countryAt(point) ?? this.borders.smallNear(point, reach)
  }

  targetAt(point: LatLon, reach: Km): FillTarget | undefined {
    const question = this.countryAt(point, reach)
    if (!question) return undefined
    let target = this.targets.get(question.clue.flag)
    if (!target) {
      target = {
        id: question.clue.flag,
        outline: this.outline(question),
        cells: (finestResolution) => this.cells(question, finestResolution)
      }
      this.targets.set(question.clue.flag, target)
    }
    return target
  }

  /** The country's outline, for the cursor. */
  outline(question: FlagQuestion): GeoJSON.MultiPolygon {
    let cursor = this.cursors.get(question.clue.flag)
    if (!cursor) {
      const shape = this.shape(question)
      const coordinates: MultiPolygon =
        shape.type === FillShapeType.OUTLINE ? shape.outline : shape.rings.map((ring) => [ring])
      // A country too small for land of its own shows as its answer's surroundings.
      cursor = {
        type: "MultiPolygon",
        coordinates: coordinates.length > 0 ? coordinates : [[circle(answerCentre(question.answer), shape.near ?? 5)]]
      }
      this.cursors.set(question.clue.flag, cursor)
    }
    return cursor
  }

  /** The cells filling the country on a layer of this finest resolution, compacted. */
  cells(question: FlagQuestion, finestResolution: H3Resolution): H3Cell[] {
    const key: FillKey = `${question.clue.flag}:${finestResolution}`
    let cells = this.fills.get(key)
    if (!cells) {
      cells = countryFill(this.shape(question), finestResolution)
      this.fills.set(key, cells)
    }
    return cells
  }

  private shape(question: FlagQuestion): FillShape {
    let shape = this.shapes.get(question.clue.flag)
    if (!shape) {
      const outline = question.answer.type === AnswerType.AREA ? this.outlines.get(question.answer.outline) : undefined
      shape = outline
        ? { type: FillShapeType.OUTLINE, outline, answer: answerCentre(question.answer) }
        : this.borders.fillShape(question)
      this.shapes.set(question.clue.flag, shape)
    }
    return shape
  }
}

/** A ring of `km` around a point, [lon, lat], for outlining a speck of a country. */
const circle = ({ lat, lon }: LatLon, km: Km): Ring => {
  const dLat = kmToDegrees(km)
  const dLon = dLat / Math.max(0.01, Math.cos(toRadians(lat)))
  const ring: Ring = []
  for (let i = 0; i <= 32; i++) {
    const angle = (i / 32) * 2 * Math.PI
    ring.push([lon + dLon * Math.cos(angle), lat + dLat * Math.sin(angle)])
  }
  return ring
}
