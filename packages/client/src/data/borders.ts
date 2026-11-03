/**
 * Which country is where (borders.json, ~65 KB gzipped), for the reveal of a
 * flag round: the flag under the pointer, and where each player's paint
 * fell. Its own chunk, fetched once a lobby's game has flags or a flag
 * round is revealed, and kept from then on. The reveal draws a country
 * painted whole by its outline, so it loads the outlines too.
 */
import { ClientErrorKind } from "@whereabouts/shared/protocol/client-error"
import { reportClientError } from "../net/client-error/report-client-error"
import { signal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import { fetchBuildJson } from "../net/stale-build"
import bordersUrl from "@whereabouts/shared/borders.json?url"
import { Borders, flatRing, type BordersData, type FlatRing } from "@whereabouts/shared/borders"
import { AnswerType, type FlagQuestion } from "@whereabouts/shared/questions"
import { CATALOGUE, isFlagQuestion } from "@whereabouts/shared/catalogue/catalogue"
import type { LatLon } from "@whereabouts/shared/geo"
import { loadOutlines, outlines } from "./outlines"
import type { VrFlagPin } from "../vr/globe/flag-pins"

/** The borders, once loaded. */
const borders = signal<Borders | undefined>(undefined)

let loading: Promise<Borders> | undefined = undefined

const loadBorders = (): Promise<Borders> => {
  loading ??= Promise.all([fetchBuildJson<BordersData>(bordersUrl), loadOutlines()]).then(
    ([rawBorders]) => (borders.value = new Borders(rawBorders, CATALOGUE.filter(isFlagQuestion))),
    (error: unknown) => {
      // Let the next caller try again, after a dropped connection say.
      loading = undefined
      throw error
    }
  )
  return loading
}

const pinsOf = new WeakMap<Borders, { country: FlagQuestion; at: LatLon }[]>()

/** Where each country's flag goes on a map: worked out once. */
export const flagPins = (loaded: Borders): { country: FlagQuestion; at: LatLon }[] => {
  let pins = pinsOf.get(loaded)
  if (!pins) pinsOf.set(loaded, (pins = loaded.pins()))
  return pins
}

const vrPinsOf = new WeakMap<Borders, VrFlagPin[]>()

/** The outline the reveal draws where the country is painted whole, finer than its borders; else those. */
const outline = (loaded: Borders, country: FlagQuestion): FlatRing[] => {
  const outline = country.answer.type === AnswerType.AREA ? outlines.value?.get(country.answer.outline) : undefined
  if (!outline) return loaded.rings(country.clue.flag)
  return outline.flatMap((polygon) => polygon.map(flatRing))
}

/** The same, as the headset takes them: the same array each time, so it sees no change. */
export const vrFlagPins = (loaded: Borders): VrFlagPin[] => {
  let pins = vrPinsOf.get(loaded)
  if (!pins)
    vrPinsOf.set(
      loaded,
      (pins = flagPins(loaded).map(({ country, at }) => ({
        flag: country.clue.flag,
        name: country.label,
        at,
        rings: outline(loaded, country)
      })))
    )
  return pins
}

/** The borders when `wanted` (a flag round), loading them if need be; undefined until they arrive. */
export const useBorders = (wanted: boolean): Borders | undefined => {
  const loaded = borders.value
  useEffect(() => {
    if (wanted && !loaded)
      loadBorders().catch((error: unknown) => {
        console.warn("could not load borders", error)
        reportClientError(ClientErrorKind.DATA_LOAD, error)
      })
  }, [wanted, loaded])
  return wanted ? loaded : undefined
}
