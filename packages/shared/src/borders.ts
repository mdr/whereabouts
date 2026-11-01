/**
 * Which country is where, for the reveal of a flag round: the country under
 * the pointer, and the countries a player's paint fell in ("Mostly in
 * Peru"). From borders.json, built with the flag questions by
 * scripts/build-regions.mjs: every flag country's land, coarser than the
 * outlines scored (about 5 km, islands under 50 km² left out).
 *
 * Where Natural Earth marks an area indeterminate (Western Sahara,
 * Palestine, the Siachen Glacier), and in Crimea, no country is named,
 * rather than take a side. Elsewhere its borders are the lines of control.
 *
 * A point is in the country whose land holds it, except within `near` of a
 * small or scattered country's answer (its tolerance), which counts as that
 * country: Tuvalu is too small to hit, and paint on San Marino would
 * otherwise all be Italy's. Where two such circles overlap, the nearer
 * answer wins.
 */
import { greatCircleDistance, toRadians, type Box, type LatLon, type Ring } from "./geo.ts"
import { answerCentre, type FlagQuestion } from "./questions.ts"
import { flagCode, type FlagCode } from "./ids.ts"
import type { PaintCell } from "./paint/paint.ts"
import { FillShapeType, type FillShape } from "./paint/fill.ts"
import type { Degrees, Km } from "./units.ts"

/** A ring as borders.json stores it: [lon, lat] steps in hundredths of a degree, the first from 0, 0. */
export type RingSteps = number[]
/** A ring as lon, lat, lon, lat, … in degrees, packed for fast point-in-ring tests. */
export type FlatRing = Float64Array

export const ringOf = (flat: FlatRing): Ring => {
  const out: Ring = []
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i]!, flat[i + 1]!])
  return out
}

export const flatRing = (ring: Ring): FlatRing => {
  return Float64Array.from(ring.flat())
}

const boxOf = (ring: FlatRing): Box => {
  const box: Box = [Infinity, Infinity, -Infinity, -Infinity]
  for (let i = 0; i < ring.length; i += 2) {
    box[0] = Math.min(box[0], ring[i]!)
    box[1] = Math.min(box[1], ring[i + 1]!)
    box[2] = Math.max(box[2], ring[i]!)
    box[3] = Math.max(box[3], ring[i + 1]!)
  }
  return box
}

interface BorderData {
  /** The flag's ISO code, as flag questions show it. */
  flag: string
  rings: RingSteps[]
  /** For a small or scattered country: how far from its answer counts as the country. */
  near?: Km
}

export interface BordersData {
  countries: BorderData[]
  /** Where no country is named. */
  none: RingSteps[]
}

interface Country {
  country: FlagQuestion
  rings: FlatRing[]
  /** Of all its rings. */
  box: Box
}

export interface PaintedCountry {
  country: FlagQuestion
  /** Its share of all the paint, 0 to 1. */
  share: number
}

export class Borders {
  private readonly countries: Country[] = []
  private readonly small: { country: FlagQuestion; near: Km }[] = []
  private readonly none: FlatRing[]
  private readonly byFlag = new Map<FlagCode, { rings: FlatRing[]; near?: Km }>()

  constructor(data: BordersData, flags: readonly FlagQuestion[]) {
    this.none = data.none.map(decodeRing)
    const byFlag = new Map(flags.map((country) => [country.clue.flag, country]))
    for (const entry of data.countries) {
      const country = byFlag.get(flagCode(entry.flag))
      if (!country) continue
      if (entry.near) this.small.push({ country, near: entry.near })
      const rings = entry.rings.map(decodeRing)
      this.byFlag.set(country.clue.flag, { rings, near: entry.near })
      if (rings.length === 0) continue
      const box = rings
        .map(boxOf)
        .reduce((a, b): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])])
      this.countries.push({ country, rings, box })
    }
  }

  /** The country at this point, or undefined (at sea, or somewhere without a flag round). */
  countryAt(point: LatLon): FlagQuestion | undefined {
    return this.nearSmall(point) ?? this.onLand(point)
  }

  /**
   * The small or scattered country with the nearest answer to this point, if
   * it is within `reach` or the country's own `near`. For the pointer: at
   * world zoom Tuvalu is far less than a pixel across.
   */
  smallNear(point: LatLon, reach: Km): FlagQuestion | undefined {
    let best: FlagQuestion | undefined = undefined
    let bestDistance = Infinity
    for (const { country, near } of this.small) {
      const distance = greatCircleDistance(point, answerCentre(country.answer))
      if (distance <= Math.max(near, reach) && distance < bestDistance) [best, bestDistance] = [country, distance]
    }
    return best
  }

  /**
   * Where the paint is, by country: each cell counts where its centre is,
   * with its intensity times its area. Largest share first; paint at sea or
   * outside any flag country is in no entry, so the shares can sum to less
   * than 1.
   */
  paintedCountries(cells: Iterable<PaintCell>): PaintedCountry[] {
    const mass = new Map<FlagQuestion, number>()
    let total = 0
    for (const cell of cells) {
      const weight = cell.intensity * cell.area
      if (!(weight > 0)) continue
      total += weight
      const country = this.countryAt(cell)
      if (country) mass.set(country, (mass.get(country) ?? 0) + weight)
    }
    return [...mass].map(([country, weight]) => ({ country, share: weight / total })).sort((a, b) => b.share - a.share)
  }

  /** A country's land, to fill (see fill.ts): its rings, answer and `near`. */
  fillShape(country: FlagQuestion): FillShape {
    const border = this.byFlag.get(country.clue.flag)
    return {
      type: FillShapeType.RINGS,
      rings: (border?.rings ?? []).map(ringOf),
      answer: answerCentre(country.answer),
      near: border?.near
    }
  }

  /** A country's outline; none if it has no shape here. */
  rings(flag: FlagCode): FlatRing[] {
    return this.byFlag.get(flag)?.rings ?? []
  }

  /**
   * A point on each country's land, for its flag: its answer where that is
   * on its land, else a point well inside its largest piece. A country's
   * middle can be outside it (Chile, Croatia). Small countries, with no
   * land drawn, keep their answer.
   */
  pins(): { country: FlagQuestion; at: LatLon }[] {
    const out: { country: FlagQuestion; at: LatLon }[] = [
      ...this.small.map(({ country }) => ({ country, at: answerCentre(country.answer) }))
    ]
    const small = new Set(this.small.map(({ country }) => country))
    for (const entry of this.countries) {
      if (small.has(entry.country)) continue
      const at = answerCentre(entry.country.answer)
      out.push({ country: entry.country, at: this.onLand(at) === entry.country ? at : inside(entry) })
    }
    return out
  }

  private nearSmall(point: LatLon): FlagQuestion | undefined {
    return this.smallNear(point, 0)
  }

  private onLand({ lat, lon }: LatLon): FlagQuestion | undefined {
    if (this.none.some((ring) => inRing(ring, lon, lat))) return undefined
    for (const { country, rings, box } of this.countries) {
      if (lon < box[0] || lon > box[2] || lat < box[1] || lat > box[3]) continue
      // Even-odd over all the country's rings: holes (Lesotho in South Africa) cancel.
      let inside = false
      for (const ring of rings) if (inRing(ring, lon, lat)) inside = !inside
      if (inside) return country
    }
    return undefined
  }
}

const GRID = 24

/** A point inside the country's largest ring, as far from its edge as a grid search finds. */
const inside = ({ country, rings }: Country): LatLon => {
  const area = (box: Box) => (box[2] - box[0]) * (box[3] - box[1])
  const ring = rings.reduce((a, b) => (area(boxOf(b)) > area(boxOf(a)) ? b : a))
  const [west, south, east, north] = boxOf(ring)
  let best: LatLon = answerCentre(country.answer)
  let bestDistance = -1
  for (let i = 0; i <= GRID; i++)
    for (let j = 0; j <= GRID; j++) {
      const lon = west + ((east - west) * (i + 0.5)) / (GRID + 1)
      const lat = south + ((north - south) * (j + 0.5)) / (GRID + 1)
      if (!inRing(ring, lon, lat)) continue
      // Nearest vertex, east-west distances shrunk towards the poles.
      const scale = Math.cos(toRadians(lat))
      let distance = Infinity
      for (let vertex = 0; vertex < ring.length; vertex += 2)
        distance = Math.min(distance, Math.hypot((ring[vertex]! - lon) * scale, ring[vertex + 1]! - lat))
      if (distance > bestDistance) [best, bestDistance] = [{ lat, lon }, distance]
    }
  return best
}

export const decodeRing = (steps: RingSteps): FlatRing => {
  const out = new Float64Array(steps.length)
  let x = 0,
    y = 0
  for (let i = 0; i < steps.length; i += 2) {
    x += steps[i]!
    y += steps[i + 1]!
    out[i] = x / 100
    out[i + 1] = y / 100
  }
  return out
}

/** Ray casting in plain longitude and latitude, as Natural Earth's rings are drawn. */
const inRing = (ring: FlatRing, lon: Degrees, lat: Degrees): boolean => {
  let inside = false
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i]!,
      yi = ring[i + 1]!,
      xj = ring[j]!,
      yj = ring[j + 1]!
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
