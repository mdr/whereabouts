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

export function ringOf(flat: FlatRing): Ring {
  const out: Ring = []
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i]!, flat[i + 1]!])
  return out
}

export function flatRing(ring: Ring): FlatRing {
  return Float64Array.from(ring.flat())
}

function boxOf(ring: FlatRing): Box {
  const b: Box = [Infinity, Infinity, -Infinity, -Infinity]
  for (let i = 0; i < ring.length; i += 2) {
    b[0] = Math.min(b[0], ring[i]!)
    b[1] = Math.min(b[1], ring[i + 1]!)
    b[2] = Math.max(b[2], ring[i]!)
    b[3] = Math.max(b[3], ring[i + 1]!)
  }
  return b
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
    for (const d of data.countries) {
      const country = byFlag.get(flagCode(d.flag))
      if (!country) continue
      if (d.near) this.small.push({ country, near: d.near })
      const rings = d.rings.map(decodeRing)
      this.byFlag.set(country.clue.flag, { rings, near: d.near })
      if (rings.length === 0) continue
      const box = rings
        .map(boxOf)
        .reduce((a, b): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])])
      this.countries.push({ country, rings, box })
    }
  }

  /** The country at this point, or undefined (at sea, or somewhere without a flag round). */
  countryAt(p: LatLon): FlagQuestion | undefined {
    return this.nearSmall(p) ?? this.onLand(p)
  }

  /**
   * The small or scattered country with the nearest answer to this point, if
   * it is within `reach` or the country's own `near`. For the pointer: at
   * world zoom Tuvalu is far less than a pixel across.
   */
  smallNear(p: LatLon, reach: Km): FlagQuestion | undefined {
    let best: FlagQuestion | undefined = undefined
    let bestD = Infinity
    for (const { country, near } of this.small) {
      const d = greatCircleDistance(p, answerCentre(country.answer))
      if (d <= Math.max(near, reach) && d < bestD) [best, bestD] = [country, d]
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
    for (const c of cells) {
      const m = c.intensity * c.area
      if (!(m > 0)) continue
      total += m
      const country = this.countryAt(c)
      if (country) mass.set(country, (mass.get(country) ?? 0) + m)
    }
    return [...mass].map(([country, m]) => ({ country, share: m / total })).sort((a, b) => b.share - a.share)
  }

  /** A country's land, to fill (see fill.ts): its rings, answer and `near`. */
  fillShape(country: FlagQuestion): FillShape {
    const d = this.byFlag.get(country.clue.flag)
    return {
      type: FillShapeType.RINGS,
      rings: (d?.rings ?? []).map(ringOf),
      answer: answerCentre(country.answer),
      near: d?.near
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
    for (const c of this.countries) {
      if (small.has(c.country)) continue
      const at = answerCentre(c.country.answer)
      out.push({ country: c.country, at: this.onLand(at) === c.country ? at : inside(c) })
    }
    return out
  }

  private nearSmall(p: LatLon): FlagQuestion | undefined {
    return this.smallNear(p, 0)
  }

  private onLand({ lat, lon }: LatLon): FlagQuestion | undefined {
    if (this.none.some((r) => inRing(r, lon, lat))) return undefined
    for (const { country, rings, box } of this.countries) {
      if (lon < box[0] || lon > box[2] || lat < box[1] || lat > box[3]) continue
      // Even-odd over all the country's rings: holes (Lesotho in South Africa) cancel.
      let inside = false
      for (const r of rings) if (inRing(r, lon, lat)) inside = !inside
      if (inside) return country
    }
    return undefined
  }
}

const GRID = 24

/** A point inside the country's largest ring, as far from its edge as a grid search finds. */
function inside({ country, rings }: Country): LatLon {
  const area = (b: Box) => (b[2] - b[0]) * (b[3] - b[1])
  const ring = rings.reduce((a, b) => (area(boxOf(b)) > area(boxOf(a)) ? b : a))
  const [w, s, e, n] = boxOf(ring)
  let best: LatLon = answerCentre(country.answer)
  let bestD = -1
  for (let i = 0; i <= GRID; i++)
    for (let j = 0; j <= GRID; j++) {
      const lon = w + ((e - w) * (i + 0.5)) / (GRID + 1)
      const lat = s + ((n - s) * (j + 0.5)) / (GRID + 1)
      if (!inRing(ring, lon, lat)) continue
      // Nearest vertex, east-west distances shrunk towards the poles.
      const k = Math.cos(toRadians(lat))
      let d = Infinity
      for (let v = 0; v < ring.length; v += 2) d = Math.min(d, Math.hypot((ring[v]! - lon) * k, ring[v + 1]! - lat))
      if (d > bestD) [best, bestD] = [{ lat, lon }, d]
    }
  return best
}

export function decodeRing(steps: RingSteps): FlatRing {
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
function inRing(r: FlatRing, lon: Degrees, lat: Degrees): boolean {
  let inside = false
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i]!,
      yi = r[i + 1]!,
      xj = r[j]!,
      yj = r[j + 1]!
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
