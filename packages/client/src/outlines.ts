/**
 * The outlines of area answers: countries, islands, lakes, seas and US
 * states. A separate chunk (outlines.json, ~200 KB gzipped), fetched the
 * first time something needs them and kept from then on: practice with
 * any of them, or a game whose host switched them on.
 */
import { signal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import { fetchBuildJson } from "./stale-build"
import outlinesUrl from "@whereabouts/shared/outlines.json?url"
import { outlinesFrom } from "@whereabouts/shared/catalogue"
import type { Outline, Outlines } from "@whereabouts/shared/questions"
import type { OutlineId } from "@whereabouts/shared/ids"

/** Every outline by id, once loaded. */
export const outlines = signal<Outlines | undefined>(undefined)

/** The last try to load them failed: worth offering another. */
export const outlinesFailed = signal(false)

let loading: Promise<Outlines> | undefined = undefined

export function loadOutlines(): Promise<Outlines> {
  if (!loading) outlinesFailed.value = false
  loading ??= fetchBuildJson<Record<string, Outline>>(outlinesUrl).then(
    (json) => (outlines.value = outlinesFrom(json)),
    (err: unknown) => {
      // Let the next caller try again, after a dropped connection say.
      loading = undefined
      outlinesFailed.value = true
      throw err
    }
  )
  return loading
}

/** The outlines when `wanted`, loading them if need be; undefined until they arrive. */
export function useOutlines(wanted: boolean): Outlines | undefined {
  const all = outlines.value
  useEffect(() => {
    if (wanted && !all) loadOutlines().catch((err: unknown) => console.warn("could not load outlines", err))
  }, [wanted, all])
  return wanted ? all : undefined
}

/** An outline by id, loading them first if need be; undefined until they arrive. */
export function useOutline(id: OutlineId | undefined): Outline | undefined {
  const all = useOutlines(id !== undefined)
  return id && all ? all.get(id) : undefined
}
