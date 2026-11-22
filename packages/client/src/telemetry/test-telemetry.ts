import type { PlayerId } from "@whereabouts/shared/ids"
import type { WebCode } from "@whereabouts/shared/telemetry/web-codes"
import { Analytics } from "./analytics"
import { createLogger, type LogEntry } from "./logger"
import type { Telemetry } from "./telemetry"

export interface TestTelemetry extends Telemetry {
  readonly entries: LogEntry[]
  /** The codes written, in order. */
  codes(): WebCode[]
  /** The fields of the last entry with this code. */
  lastFields(code: WebCode): LogEntry["fields"] | undefined
  playerId: PlayerId | undefined
}

export const testTelemetry = (now: () => number = () => 0): TestTelemetry => {
  const entries: LogEntry[] = []
  const logger = createLogger({ now }, [(entry) => entries.push(entry)])
  const telemetry: TestTelemetry = {
    logger,
    analytics: new Analytics(logger),
    entries,
    codes: () => entries.map((entry) => entry.code),
    lastFields: (code) => entries.filter((entry) => entry.code === code).at(-1)?.fields,
    playerId: undefined,
    identify: (playerId) => {
      telemetry.playerId = playerId
    }
  }
  return telemetry
}
