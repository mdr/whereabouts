import { TelemetryLevel } from "@whereabouts/shared/protocol/client-telemetry"
import type { AnalyticsCode } from "@whereabouts/shared/telemetry/web-codes"
import type { Fields, Logger } from "./logger"

/** What a player does, written to the log at INFO: one record per concrete action, none for pointer moves or keystrokes. */
export class Analytics {
  readonly #logger: Logger

  constructor(logger: Logger) {
    this.#logger = logger
  }

  track(code: AnalyticsCode, msg: string, fields?: Fields): void {
    this.#logger.write(TelemetryLevel.INFO, code, msg, fields)
  }
}
