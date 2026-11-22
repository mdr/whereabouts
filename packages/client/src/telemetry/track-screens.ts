import { effect, type ReadonlySignal } from "@preact/signals"
import { ANALYTICS_CODES } from "@whereabouts/shared/telemetry/web-codes"
import type { Route } from "../router"
import type { Telemetry } from "./telemetry"

/**
 * Each screen a player goes to, the first included. A navigation sets the
 * route, then the browser's hashchange sets an equal one: that is not a
 * second visit, though navigating to the same route again is.
 */
export const trackScreens = (
  { analytics }: Pick<Telemetry, "analytics">,
  route: ReadonlySignal<Route>,
  visit: ReadonlySignal<number>
): void => {
  let last: string | undefined = undefined
  effect(() => {
    const now = `${visit.value} ${JSON.stringify(route.value)}`
    if (now === last) return
    last = now
    analytics.track(ANALYTICS_CODES.nav.screenOpened, "opened a screen", { routeType: route.value.type })
  })
}
