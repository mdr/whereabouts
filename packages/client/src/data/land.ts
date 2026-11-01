/**
 * The masks for the trim buttons, each its own chunk, fetched the first time
 * its button is pressed and kept from then on: the land mask for "Trim sea"
 * (land.json, ~100 KB gzipped) and the water mask for "Trim land" in a lake
 * or sea round (water.json, ~130 KB gzipped).
 */
import { LandMask, WaterMask } from "@whereabouts/shared/paint/land"

const once = <T>(load: () => Promise<T>): (() => Promise<T>) => {
  let loading: Promise<T> | undefined = undefined
  return () =>
    (loading ??= load().catch((error: unknown) => {
      // Let the next press try again, after a dropped connection say.
      loading = undefined
      throw error
    }))
}

export const loadLandMask = once(() =>
  import("@whereabouts/shared/land.json").then((land) => new LandMask(land.default))
)

export const loadWaterMask = once(() =>
  import("@whereabouts/shared/water.json").then((water) => new WaterMask(water.default))
)
