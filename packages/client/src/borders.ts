/**
 * Which country is where (borders.json, ~65 KB gzipped), for the reveal of a
 * flag round: the flag under the pointer, and where each player's paint
 * fell. Its own chunk, fetched when a game with flags starts or a flag
 * round is revealed, and kept from then on. It needs the flag rounds too,
 * so it loads the countries first.
 */
import { signal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import { Borders, type FlagQuestion, type LatLon } from "@whereabouts/shared"
import { loadRegions, flagQuestions, regions } from "./regions"
import type { VrFlagPin } from "./vr/flag-pins"

/** The borders, once loaded. */
export const borders = signal<Borders | undefined>(undefined)

let loading: Promise<Borders> | undefined = undefined

export function loadBorders(): Promise<Borders> {
  loading ??= Promise.all([import("@whereabouts/shared/borders.json"), loadRegions()]).then(
    ([m]) => (borders.value = new Borders(m.default, flagQuestions.value ?? [])),
    (err: unknown) => {
      // Let the next caller try again, after a dropped connection say.
      loading = undefined
      throw err
    }
  )
  return loading
}

const pinsOf = new WeakMap<Borders, { f: FlagQuestion; at: LatLon }[]>()

/** Where each country's flag goes on a map: worked out once. */
export function flagPins(b: Borders): { f: FlagQuestion; at: LatLon }[] {
  let pins = pinsOf.get(b)
  if (!pins) pinsOf.set(b, (pins = b.pins()))
  return pins
}

const vrPinsOf = new WeakMap<Borders, VrFlagPin[]>()

/** The outline the reveal draws where the country is painted whole, finer than its borders; else those. */
function outline(b: Borders, f: FlagQuestion): Float64Array[] {
  const region = f.regionId === undefined ? undefined : regions.value?.get(f.regionId)
  if (!region) return b.rings(f.flag)
  return region.outline.flatMap((polygon) => polygon.map((ring) => Float64Array.from(ring.flat())))
}

/** The same, as the headset takes them: the same array each time, so it sees no change. */
export function vrFlagPins(b: Borders): VrFlagPin[] {
  let pins = vrPinsOf.get(b)
  if (!pins)
    vrPinsOf.set(
      b,
      (pins = flagPins(b).map(({ f, at }) => ({ flag: f.flag, name: f.label, at, rings: outline(b, f) })))
    )
  return pins
}

/** The borders when `wanted` (a flag round), loading them if need be; undefined until they arrive. */
export function useBorders(wanted: boolean): Borders | undefined {
  const b = borders.value
  useEffect(() => {
    if (wanted && !b) loadBorders().catch((err: unknown) => console.warn("could not load borders", err))
  }, [wanted, b])
  return wanted ? b : undefined
}
