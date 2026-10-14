/**
 * Outlines for "Paint the whole of …" questions: the countries, the flag
 * rounds that use them, and the islands, lakes, seas and US states. They are
 * a separate chunk (regions.json, flags.json and features.json, ~200 KB
 * gzipped), fetched the first time something needs them and kept from then
 * on: practice with any of them, or a game whose host switched them on.
 */
import { signal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import {
  featureFrom,
  flagFrom,
  regionFrom,
  type FlagData,
  type FlagQuestion,
  type Question,
  type QuestionData,
  type RegionData,
  type RegionId,
  type RegionQuestion
} from "@whereabouts/shared"

/** Every outline by id, countries and features alike, once loaded. */
export const regions = signal<Map<RegionId, RegionQuestion> | undefined>(undefined)

/** One flag round per country, once loaded (with the countries). */
export const flagQuestions = signal<FlagQuestion[] | undefined>(undefined)

/** The islands, lakes, seas and US states, once loaded: most painted whole, a few small states asked as a point. */
export const featureQuestions = signal<(Question | RegionQuestion)[] | undefined>(undefined)

let loading: Promise<Map<RegionId, RegionQuestion>> | undefined = undefined

export function loadRegions(): Promise<Map<RegionId, RegionQuestion>> {
  loading ??= Promise.all([
    import("@whereabouts/shared/regions.json"),
    import("@whereabouts/shared/flags.json"),
    import("@whereabouts/shared/features.json")
  ]).then(
    ([r, f, x]) => {
      const features = (x.default as (QuestionData | RegionData)[]).map(featureFrom)
      const countries = (r.default as RegionData[]).map(regionFrom)
      const byId = new Map(
        [...countries, ...features.filter((q): q is RegionQuestion => q.kind === "region")].map((q) => [q.id, q])
      )
      flagQuestions.value = (f.default as FlagData[]).map(flagFrom)
      featureQuestions.value = features
      regions.value = byId
      return byId
    },
    (err: unknown) => {
      // Let the next caller try again, after a dropped connection say.
      loading = undefined
      throw err
    }
  )
  return loading
}

/** An outline by id, loading them first if need be; undefined until they arrive. */
export function useRegion(id: RegionId | undefined): RegionQuestion | undefined {
  const byId = regions.value
  useEffect(() => {
    if (id && !byId) loadRegions().catch((err: unknown) => console.warn("could not load countries", err))
  }, [id, byId])
  return id && byId ? byId.get(id) : undefined
}
