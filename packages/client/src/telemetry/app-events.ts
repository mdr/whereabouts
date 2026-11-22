import { effect } from "@preact/signals"
import { ANALYTICS_CODES, WEB_LOG_CODES } from "@whereabouts/shared/telemetry/web-codes"
import { route } from "../router"
import type { Telemetry } from "./telemetry"

/** Once a page load: what kind of device, so a problem can be tied to phones, tablets or desktops. */
export const logAppStarted = ({ logger }: Pick<Telemetry, "logger">): void => {
  logger.info(WEB_LOG_CODES.app.started, "app started", {
    touch: matchMedia("(pointer: coarse)").matches,
    viewportWidthPx: innerWidth,
    viewportHeightPx: innerHeight,
    pixelRatio: devicePixelRatio
  })
}

/** Each screen a player goes to, the first included. */
export const trackScreens = ({ analytics }: Pick<Telemetry, "analytics">): void => {
  effect(() => {
    analytics.track(ANALYTICS_CODES.nav.screenOpened, "opened a screen", { screen: route.value.type })
  })
}
