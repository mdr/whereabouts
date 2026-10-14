/**
 * Which country is where (borders.json, ~65 KB gzipped), for the reveal of a
 * flag round: the flag under the pointer, and where each player's paint
 * fell. Its own chunk, fetched when a game with flags starts or a flag
 * round is revealed, and kept from then on. It needs the flag rounds too,
 * so it loads the countries first.
 */
import { signal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import { Borders } from "@whereabouts/shared"
import { loadRegions, flagQuestions } from "./regions"

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

/** The borders when `wanted` (a flag round), loading them if need be; undefined until they arrive. */
export function useBorders(wanted: boolean): Borders | undefined {
  const b = borders.value
  useEffect(() => {
    if (wanted && !b) loadBorders().catch((err: unknown) => console.warn("could not load borders", err))
  }, [wanted, b])
  return wanted ? b : undefined
}
