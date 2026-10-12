/**
 * Outlines for "Paint the whole of …" questions: the countries, the flag
 * rounds that use them, and the islands, lakes, seas and US states. They are
 * a separate chunk (regions.json, flags.json and features.json, ~200 KB
 * gzipped), fetched the first time something needs them and kept from then
 * on: practice with any of them, or a game whose host switched them on.
 */
import { signal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import type { FlagQuestion, Question, RegionQuestion } from "@whereabouts/shared"

/** Every outline by id, countries and features alike, once loaded. */
export const regions = signal<Map<string, RegionQuestion> | null>(null)

/** One flag round per country, once loaded (with the countries). */
export const flagQuestions = signal<FlagQuestion[] | null>(null)

/** The islands, lakes, seas and US states, once loaded: most painted whole, a few small states asked as a point. */
export const featureQuestions = signal<(Question | RegionQuestion)[] | null>(null)

let loading: Promise<Map<string, RegionQuestion>> | null = null

export function loadRegions(): Promise<Map<string, RegionQuestion>> {
  loading ??= Promise.all([
    import("@whereabouts/shared/regions.json"),
    import("@whereabouts/shared/flags.json"),
    import("@whereabouts/shared/features.json")
  ]).then(
    ([r, f, x]) => {
      const features = x.default as (Question | RegionQuestion)[]
      const byId = new Map(
        [...(r.default as RegionQuestion[]), ...features.filter((q) => q.kind === "region")].map((q) => [q.id, q])
      )
      flagQuestions.value = f.default
      featureQuestions.value = features
      regions.value = byId
      return byId
    },
    (err: unknown) => {
      // Let the next caller try again, after a dropped connection say.
      loading = null
      throw err
    }
  )
  return loading
}

/** An outline by id, loading them first if need be; null until they arrive. */
export function useRegion(id: string | undefined): RegionQuestion | null {
  const byId = regions.value
  useEffect(() => {
    if (id && !byId) loadRegions().catch((err: unknown) => console.warn("could not load countries", err))
  }, [id, byId])
  return id && byId ? (byId.get(id) ?? null) : null
}
