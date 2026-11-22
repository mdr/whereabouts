// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test"
import { batch, signal } from "@preact/signals"
import { ANALYTICS_CODES } from "@whereabouts/shared/telemetry/web-codes"
import { RouteType, type Route } from "../router"
import { trackScreens } from "./track-screens"
import { testTelemetry } from "./test-telemetry"

describe("trackScreens", () => {
  it("tracks each screen once, the first included, and the same one again only when navigated to again", () => {
    const telemetry = testTelemetry()
    const route = signal<Route>({ type: RouteType.HOME })
    const visit = signal(0)
    trackScreens(telemetry, route, visit)
    batch(() => {
      route.value = { type: RouteType.SOLO }
      visit.value++
    })
    route.value = { type: RouteType.SOLO }
    visit.value++
    expect(telemetry.entries.map((entry) => entry.fields)).toEqual([
      { routeType: RouteType.HOME },
      { routeType: RouteType.SOLO },
      { routeType: RouteType.SOLO }
    ])
    expect(new Set(telemetry.codes())).toEqual(new Set([ANALYTICS_CODES.nav.screenOpened]))
  })
})
