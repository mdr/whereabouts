import type { Clock } from "@whereabouts/shared/clock"
import { TelemetryLevel, type FieldValue } from "@whereabouts/shared/protocol/client-telemetry"
import type { WebCode, WebLogCode } from "@whereabouts/shared/telemetry/web-codes"
import type { Instant } from "@whereabouts/shared/units"

/** Small facts and IDs: never what a player typed, their paint, or a token. */
export type Fields = Record<string, FieldValue | undefined>

export interface LogEntry {
  at: Instant
  level: TelemetryLevel
  code: WebCode
  msg: string
  fields: Record<string, FieldValue>
}

export type LogSink = (entry: LogEntry) => void

export interface Logger {
  error(code: WebLogCode, msg: string, fields?: Fields): void
  warn(code: WebLogCode, msg: string, fields?: Fields): void
  info(code: WebLogCode, msg: string, fields?: Fields): void
  debug(code: WebLogCode, msg: string, fields?: Fields): void
  /** Any code at any level: for Analytics, which writes at INFO. */
  write(level: TelemetryLevel, code: WebCode, msg: string, fields?: Fields): void
}

const defined = (fields: Fields): Record<string, FieldValue> =>
  Object.fromEntries(Object.entries(fields).filter((entry): entry is [string, FieldValue] => entry[1] !== undefined))

export const createLogger = (clock: Pick<Clock, "now">, sinks: readonly LogSink[]): Logger => {
  const write = (level: TelemetryLevel, code: WebCode, msg: string, fields: Fields = {}): void => {
    const entry: LogEntry = { at: clock.now(), level, code, msg, fields: defined(fields) }
    for (const sink of sinks) {
      try {
        sink(entry)
      } catch {
        // Telemetry must never be what breaks.
      }
    }
  }
  return {
    error: (code, msg, fields) => write(TelemetryLevel.ERROR, code, msg, fields),
    warn: (code, msg, fields) => write(TelemetryLevel.WARN, code, msg, fields),
    info: (code, msg, fields) => write(TelemetryLevel.INFO, code, msg, fields),
    debug: (code, msg, fields) => write(TelemetryLevel.DEBUG, code, msg, fields),
    write
  }
}
