import type { Logger } from "pino"
import type { LogCode } from "./log-codes.ts"

export type LogLevel = "info" | "warn" | "error"

/** Log one event as a JSON line: its `code`, a short sentence for people, and the fields. */
export const logEvent = (
  logger: Logger,
  code: LogCode,
  message: string,
  fields: Record<string, unknown> = {},
  level: LogLevel = "info"
): void => {
  logger[level]({ code, ...fields }, message)
}
