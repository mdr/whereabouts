/** How a hand's tool paints the globe, and which tools it steps through. */
import { EARTH_RADIUS, greatCircleDistance, type LatLon } from "@whereabouts/shared/geo"
import type { Km, Metres, Seconds } from "@whereabouts/shared/units"
import { Hand } from "./hand"
import { Tool } from "../tool"

export type SprayTool = Tool.PAINT | Tool.ERASE | Tool.FILL

const MIN_RADIUS: Km = 1
const MAX_RADIUS: Km = 3000
/** Held still, the spray keeps adding paint this often. */
export const STILL_STAMP: Seconds = 0.15

/** The ground a spot this wide covers on a globe this big: less as the globe is zoomed in. */
export function groundRadius(spot: Metres, globeRadius: Metres): Km {
  return Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, (spot / globeRadius) * EARTH_RADIUS))
}

/** Whether a stroke has moved a quarter of its radius, or been held long enough, for another stamp. */
export function stampDue(last: { at: LatLon; t: Seconds } | undefined, at: LatLon, radius: Km, now: Seconds): boolean {
  return !last || greatCircleDistance(last.at, at) >= radius / 4 || now - last.t >= STILL_STAMP
}

/** The tool after this one: spray can, eraser, and the pail too when the round can be filled. */
export function nextTool(tool: SprayTool, fillable: boolean): SprayTool {
  const order: SprayTool[] = fillable ? [Tool.PAINT, Tool.ERASE, Tool.FILL] : [Tool.PAINT, Tool.ERASE]
  return order[(order.indexOf(tool) + 1) % order.length]!
}

/** What a hand holds when Fill stops being offered: each hand back to its usual tool. */
export function offeredTool(tool: SprayTool, fillable: boolean, hand: Hand): SprayTool {
  if (fillable || tool !== Tool.FILL) return tool
  return hand === Hand.LEFT ? Tool.ERASE : Tool.PAINT
}
