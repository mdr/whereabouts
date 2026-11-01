/**
 * Notices a connection that died without closing: after a phone changes
 * network, the browser can go on holding a socket that reaches nothing, for
 * minutes. Pings now and then, and at once when the page or the network
 * comes back; a ping with no pong in time means the socket is gone.
 */
import type { Ms } from "@whereabouts/shared/units"

export const PING_EVERY: Ms = 15_000
export const PONG_WITHIN: Ms = 3_000

export interface Heartbeat {
  pong(): void
  stop(): void
}

export const startHeartbeat = (ping: () => void, dead: () => void): Heartbeat => {
  let waiting: ReturnType<typeof setTimeout> | undefined = undefined

  const check = () => {
    if (waiting !== undefined) return
    ping()
    waiting = setTimeout(() => {
      stop()
      dead()
    }, PONG_WITHIN)
  }
  // A hidden page's timers are throttled, so its pongs could look late; it checks on coming back instead.
  const every = setInterval(() => {
    if (document.visibilityState === "visible") check()
  }, PING_EVERY)
  const onVisible = () => {
    if (document.visibilityState === "visible") check()
  }
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) check()
  }
  document.addEventListener("visibilitychange", onVisible)
  window.addEventListener("online", check)
  window.addEventListener("pageshow", onPageShow)

  const stop = () => {
    clearInterval(every)
    clearTimeout(waiting)
    waiting = undefined
    document.removeEventListener("visibilitychange", onVisible)
    window.removeEventListener("online", check)
    window.removeEventListener("pageshow", onPageShow)
  }

  return {
    pong() {
      clearTimeout(waiting)
      waiting = undefined
    },
    stop
  }
}
