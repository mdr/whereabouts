import { TelemetryLevel } from "@whereabouts/shared/protocol/client-telemetry"
import type { LogSink } from "./logger"

const METHOD = {
  [TelemetryLevel.ERROR]: "error",
  [TelemetryLevel.WARN]: "warn",
  [TelemetryLevel.INFO]: "info",
  [TelemetryLevel.DEBUG]: "debug"
} as const

export const consoleSink: LogSink = ({ level, code, msg, fields }) => {
  console[METHOD[level]](`[${code}] ${msg}`, fields)
}
