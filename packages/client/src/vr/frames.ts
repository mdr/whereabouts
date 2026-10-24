/**
 * While a headset session shows, the browser runs none of the page's
 * animation frames. Some page code waits on one: MapLibre loads a map's
 * style only on the next frame, so a map made during the session (practice
 * started from the headset's menu) would never load. Until the session
 * ends, frames come from a timer instead.
 */
const FRAME_MS = 50

let native: { request: typeof requestAnimationFrame; cancel: typeof cancelAnimationFrame } | undefined = undefined

export function timerFrames(on: boolean): void {
  if (on && !native) {
    native = { request: window.requestAnimationFrame, cancel: window.cancelAnimationFrame }
    window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), FRAME_MS)
    window.cancelAnimationFrame = (id) => window.clearTimeout(id)
  } else if (!on && native) {
    window.requestAnimationFrame = native.request
    window.cancelAnimationFrame = native.cancel
    native = undefined
  }
}
