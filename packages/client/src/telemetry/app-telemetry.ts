import { realClock } from "@whereabouts/shared/clock"
import { CLIENT_TELEMETRY_PATH, type TelemetryBatch } from "@whereabouts/shared/protocol/client-telemetry"
import type { PlayerId } from "@whereabouts/shared/ids"
import { CLIENT_BUILD } from "../build"
import { roomOf, screenOf } from "../net/client-error/build-report"
import { Analytics } from "./analytics"
import { consoleSink } from "./console-sink"
import { createLogger } from "./logger"
import { TelemetryShipper } from "./shipper"
import type { Telemetry } from "./telemetry"

const newSession = (): string =>
  typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Math.random().toString(36).slice(2)

const send = (batch: TelemetryBatch): void => {
  fetch(CLIENT_TELEMETRY_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(batch),
    keepalive: true
  }).catch(() => undefined)
}

/** The page's telemetry: to the console, and in batches to the server's log. */
export const createAppTelemetry = (): Telemetry => {
  let playerId: PlayerId | undefined = undefined
  const shipper = new TelemetryShipper({
    clock: realClock,
    session: newSession(),
    build: CLIENT_BUILD,
    send,
    context: () => {
      const screen = screenOf(location.hash)
      return { screen, room: roomOf(screen)?.toUpperCase(), playerId }
    }
  })
  // The last chance to send: a tab put away on a phone may never come back.
  addEventListener("pagehide", () => shipper.flush())
  addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") shipper.flush()
  })
  const logger = createLogger(realClock, [consoleSink, shipper.sink])
  return {
    logger,
    analytics: new Analytics(logger),
    identify: (id) => {
      playerId = id
    }
  }
}
