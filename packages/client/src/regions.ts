/**
 * Country outlines for "Paint the whole of …" questions. They are a separate
 * chunk (regions.json, ~70 KB gzipped), fetched the first time something
 * needs them and kept from then on: practice with whole countries, or a game
 * whose host switched countries on.
 */
import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { RegionQuestion } from "@whereabouts/shared";

/** The countries by id, once loaded. */
export const regions = signal<Map<string, RegionQuestion> | null>(null);

let loading: Promise<Map<string, RegionQuestion>> | null = null;

export function loadRegions(): Promise<Map<string, RegionQuestion>> {
  loading ??= import("@whereabouts/shared/regions.json").then(
    (m) => {
      const byId = new Map((m.default as RegionQuestion[]).map((q) => [q.id, q]));
      regions.value = byId;
      return byId;
    },
    (err: unknown) => {
      // Let the next caller try again, after a dropped connection say.
      loading = null;
      throw err;
    },
  );
  return loading;
}

/** A country by id, loading the countries first if need be; null until they arrive. */
export function useRegion(id: string | undefined): RegionQuestion | null {
  const byId = regions.value;
  useEffect(() => {
    if (id && !byId) loadRegions().catch((err: unknown) => console.warn("could not load countries", err));
  }, [id, byId]);
  return id && byId ? (byId.get(id) ?? null) : null;
}
