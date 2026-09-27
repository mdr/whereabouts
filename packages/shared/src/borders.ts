/**
 * Which country is where, for the reveal of a flag round: the country under
 * the pointer, and the countries a player's paint fell in ("Mostly in
 * Peru"). From borders.json, built with flags.json by
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
import { greatCircleDistance, type LatLon } from "./geo.ts";
import type { FlagQuestion } from "./flags.ts";
import type { PaintCell } from "./paint.ts";

export interface BorderData {
  /** The flag's ISO code, as in flags.json. */
  flag: string;
  /** Rings of [lon, lat] steps in hundredths of a degree, the first from 0, 0. */
  rings: number[][];
  /** For a small or scattered country: how far from its answer counts as the country, km. */
  near?: number;
}

export interface BordersData {
  countries: BorderData[];
  /** Rings, encoded the same way, where no country is named. */
  none: number[][];
}

interface Country {
  f: FlagQuestion;
  /** Decoded rings: lon, lat, lon, lat, … in degrees. */
  rings: Float64Array[];
  /** West, south, east, north of all its rings. */
  box: [number, number, number, number];
}

export interface PaintedCountry {
  country: FlagQuestion;
  /** Its share of all the paint, 0 to 1. */
  share: number;
}

export class Borders {
  private readonly countries: Country[] = [];
  private readonly small: { f: FlagQuestion; near: number }[] = [];
  private readonly none: Float64Array[];

  constructor(data: BordersData, flags: readonly FlagQuestion[]) {
    this.none = data.none.map(decodeRing);
    const byFlag = new Map(flags.map((f) => [f.flag, f]));
    for (const d of data.countries) {
      const f = byFlag.get(d.flag);
      if (!f) continue;
      if (d.near) this.small.push({ f, near: d.near });
      const rings = d.rings.map(decodeRing);
      if (rings.length === 0) continue;
      const box: Country["box"] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const r of rings)
        for (let i = 0; i < r.length; i += 2) {
          box[0] = Math.min(box[0], r[i]!);
          box[1] = Math.min(box[1], r[i + 1]!);
          box[2] = Math.max(box[2], r[i]!);
          box[3] = Math.max(box[3], r[i + 1]!);
        }
      this.countries.push({ f, rings, box });
    }
  }

  /** The country at this point, or null (at sea, or somewhere without a flag round). */
  countryAt(p: LatLon): FlagQuestion | null {
    return this.nearSmall(p) ?? this.onLand(p);
  }

  /**
   * The small or scattered country with the nearest answer to this point, if
   * it is within `px` pixels (at `kmPerPx`) or the country's own `near`. For
   * the pointer: at world zoom Tuvalu is far less than a pixel across.
   */
  smallNear(p: LatLon, kmPerPx: number, px: number): FlagQuestion | null {
    let best: FlagQuestion | null = null;
    let bestD = Infinity;
    for (const { f, near } of this.small) {
      const d = greatCircleDistance(p, f.answer);
      if (d <= Math.max(near, px * kmPerPx) && d < bestD) [best, bestD] = [f, d];
    }
    return best;
  }

  /**
   * Where the paint is, by country: each cell counts where its centre is,
   * with its intensity times its area. Largest share first; paint at sea or
   * outside any flag country is in no entry, so the shares can sum to less
   * than 1.
   */
  paintedCountries(cells: Iterable<PaintCell>): PaintedCountry[] {
    const mass = new Map<FlagQuestion, number>();
    let total = 0;
    for (const c of cells) {
      const m = c.intensity * c.areaKm2;
      if (!(m > 0)) continue;
      total += m;
      const f = this.countryAt(c);
      if (f) mass.set(f, (mass.get(f) ?? 0) + m);
    }
    return [...mass].map(([country, m]) => ({ country, share: m / total })).sort((a, b) => b.share - a.share);
  }

  private nearSmall(p: LatLon): FlagQuestion | null {
    return this.smallNear(p, 0, 0);
  }

  private onLand({ lat, lon }: LatLon): FlagQuestion | null {
    if (this.none.some((r) => inRing(r, lon, lat))) return null;
    for (const { f, rings, box } of this.countries) {
      if (lon < box[0] || lon > box[2] || lat < box[1] || lat > box[3]) continue;
      // Even-odd over all the country's rings: holes (Lesotho in South Africa) cancel.
      let inside = false;
      for (const r of rings) if (inRing(r, lon, lat)) inside = !inside;
      if (inside) return f;
    }
    return null;
  }
}

function decodeRing(steps: number[]): Float64Array {
  const out = new Float64Array(steps.length);
  let x = 0,
    y = 0;
  for (let i = 0; i < steps.length; i += 2) {
    x += steps[i]!;
    y += steps[i + 1]!;
    out[i] = x / 100;
    out[i + 1] = y / 100;
  }
  return out;
}

/** Ray casting in plain longitude and latitude, as Natural Earth's rings are drawn. */
function inRing(r: Float64Array, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i]!,
      yi = r[i + 1]!,
      xj = r[j]!,
      yj = r[j + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
