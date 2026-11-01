import type { Ms } from "@whereabouts/shared/units"
/**
 * While a headset session shows, the browser runs none of the page's
 * animation frames. Some page code waits on one: MapLibre loads a map's
 * style only on the next frame, so a map made during the session (practice
 * started from the headset's menu) would never load. Until the session
 * ends, frames come from a timer instead.
 */
const FRAME_INTERVAL: Ms = 50

let native: { request: typeof requestAnimationFrame; cancel: typeof cancelAnimationFrame } | undefined = undefined

export const timerFrames = (on: boolean): void => {
  if (on && !native) {
    native = { request: window.requestAnimationFrame, cancel: window.cancelAnimationFrame }
    window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(performance.now()), FRAME_INTERVAL)
    window.cancelAnimationFrame = (id) => window.clearTimeout(id)
  } else if (!on && native) {
    window.requestAnimationFrame = native.request
    window.cancelAnimationFrame = native.cancel
    native = undefined
  }
}
