/** Sends what Rivalis and its transports log through the app's pino logger, so every line is JSON. */
import { LogReporter, LoggerFactory } from "@toolcase/logging"
import type { Logger, Level } from "pino"

type LoggerLevel = LoggerFactory["level"]

const PINO_LEVELS: Record<Exclude<LoggerLevel, "silent">, Level> = {
  verbose: "trace",
  debug: "debug",
  info: "info",
  warning: "warn",
  error: "error"
}

const FACTORY_LEVELS: Record<Level | "fatal", LoggerLevel> = {
  trace: "verbose",
  debug: "debug",
  info: "info",
  warn: "warning",
  error: "error",
  fatal: "error"
}

/** The logging factory's level that lets through what pino at `level` would keep. */
export const factoryLevel = (level: string): LoggerLevel =>
  level === "silent" ? "silent" : FACTORY_LEVELS[level as Level]

/** A logger named `room=CODE` is the room's; any other name is a component. */
export const describeScope = (scope: string): { component: string; room?: string } =>
  scope.startsWith("room=") ? { component: "room", room: scope.slice("room=".length) } : { component: scope }

/** Objects are fields, errors the `err` field, anything else the message. */
export const describeMessages = (messages: unknown[]): { fields: Record<string, unknown>; message: string } => {
  const fields: Record<string, unknown> = {}
  const words: string[] = []
  for (const part of messages) {
    if (part instanceof Error) fields["err"] = part
    else if (part instanceof Object) Object.assign(fields, part)
    else words.push(String(part))
  }
  return { fields, message: words.join(" ") }
}

class PinoReporter extends LogReporter {
  private readonly logger: Logger

  constructor(logger: Logger) {
    super()
    this.logger = logger
  }

  override log(level: LoggerLevel, scope: string, _time: string, messages: unknown[]): void {
    if (level === "silent") return
    const { fields, message } = describeMessages(messages)
    this.logger[PINO_LEVELS[level]]({ ...describeScope(scope), ...fields }, message)
  }
}

/** A logging factory for Rivalis whose lines are pino's, at pino's level. */
export const pinoLoggingFactory = (logger: Logger): LoggerFactory => {
  const factory = new LoggerFactory([new PinoReporter(logger)])
  factory.level = factoryLevel(logger.level)
  return factory
}
