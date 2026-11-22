import { WEB_LOG_CODES } from "@whereabouts/shared/telemetry/web-codes"
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
