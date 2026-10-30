/**
 * Outlines for "Paint the whole of …" questions: the countries, the flag
 * rounds that use them, and the islands, lakes, seas and US states. They are
 * a separate chunk (regions.json, flags.json and features.json, ~200 KB
 * gzipped), fetched the first time something needs them and kept from then
 * on: practice with any of them, or a game whose host switched them on.
 */
import { signal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import { fetchBuildJson } from "./stale-build"
import regionsUrl from "@whereabouts/shared/regions.json?url"
import flagsUrl from "@whereabouts/shared/flags.json?url"
import featuresUrl from "@whereabouts/shared/features.json?url"
import { featureFrom, regionFrom, type RegionData, type RegionQuestion } from "@whereabouts/shared/regions"
import { flagFrom, type FlagData, type FlagQuestion } from "@whereabouts/shared/flags"
import type { Question, QuestionData } from "@whereabouts/shared/questions"
import type { RegionId } from "@whereabouts/shared/ids"

/** Every outline by id, countries and features alike, once loaded. */
export const regions = signal<Map<RegionId, RegionQuestion> | undefined>(undefined)

/** One flag round per country, once loaded (with the countries). */
export const flagQuestions = signal<FlagQuestion[] | undefined>(undefined)

/** The islands, lakes, seas and US states, once loaded: most painted whole, a few small states asked as a point. */
export const featureQuestions = signal<(Question | RegionQuestion)[] | undefined>(undefined)

/** The last try to load them failed: worth offering another. */
export const regionsFailed = signal(false)

let loading: Promise<Map<RegionId, RegionQuestion>> | undefined = undefined

export function loadRegions(): Promise<Map<RegionId, RegionQuestion>> {
  if (!loading) regionsFailed.value = false
  loading ??= Promise.all([
    fetchBuildJson<RegionData[]>(regionsUrl),
    fetchBuildJson<FlagData[]>(flagsUrl),
    fetchBuildJson<(QuestionData | RegionData)[]>(featuresUrl)
  ]).then(
    ([r, f, x]) => {
      const features = x.map(featureFrom)
      const countries = r.map(regionFrom)
      const byId = new Map(
        [...countries, ...features.filter((q): q is RegionQuestion => q.kind === "region")].map((q) => [q.id, q])
      )
      flagQuestions.value = f.map(flagFrom)
      featureQuestions.value = features
      regions.value = byId
      return byId
    },
    (err: unknown) => {
      // Let the next caller try again, after a dropped connection say.
      loading = undefined
      regionsFailed.value = true
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
