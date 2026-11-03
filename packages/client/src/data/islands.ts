/**
 * The landmasses for the Fill tool on an island round (islands.json, ~100 KB
 * gzipped): its own chunk, fetched on the first island round and kept.
 */
import { signal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import type { Polygon } from "@whereabouts/shared/geo"
import { IslandFiller } from "../paint/island-fill"

const islands = signal<IslandFiller | undefined>(undefined)

let loading: Promise<IslandFiller> | undefined = undefined

const loadIslands = (): Promise<IslandFiller> => {
  loading ??= import("@whereabouts/shared/islands.json").then(
    (json) => (islands.value = new IslandFiller(json.default as Polygon[])),
    (error: unknown) => {
      // Let the next round try again, after a dropped connection say.
      loading = undefined
      throw error
    }
  )
  return loading
}

/** The islands to fill, loading them first if need be; undefined until they arrive. */
export const useIslands = (wanted: boolean): IslandFiller | undefined => {
  const loaded = islands.value
  useEffect(() => {
    if (wanted && !loaded) loadIslands().catch((error: unknown) => console.warn("could not load islands", error))
  }, [wanted, loaded])
  return wanted ? loaded : undefined
}
