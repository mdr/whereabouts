/**
 * The masks for the trim buttons, each its own chunk, fetched the first time
 * its button is pressed and kept from then on: the land mask for "Trim sea"
 * (land.json, ~100 KB gzipped) and the water mask for "Trim land" in a lake
 * or sea round (water.json, ~150 KB gzipped).
 */
import { LandMask, WaterMask } from "@whereabouts/shared/paint/land"
import { Surface } from "@whereabouts/shared/questions"

import { once } from "./load-once"

export const loadLandMask = once(() =>
  import("@whereabouts/shared/land.json").then((land) => new LandMask(land.default))
)

const loadWater = (surface: Surface.SEA | Surface.LAKE): (() => Promise<WaterMask>) =>
  once(() => import("@whereabouts/shared/water.json").then((water) => new WaterMask(water.default, surface)))

const WATER_MASKS = { [Surface.SEA]: loadWater(Surface.SEA), [Surface.LAKE]: loadWater(Surface.LAKE) }

export const loadWaterMask = (surface: Surface.SEA | Surface.LAKE): Promise<WaterMask> => WATER_MASKS[surface]()
