import pino, { type DestinationStream, type Logger } from "pino"
import type { Game } from "@whereabouts/shared/game/game"
import { Metrics } from "./metrics.ts"

/**
 * What the server reports through: `logger` writes JSON lines (log events with
 * `logEvent`), `metrics.registry` is scraped by Prometheus.
 */
export interface Telemetry {
  logger: Logger
  metrics: Metrics
}

export const createLogger = (level: string, destination?: DestinationStream): Logger =>
  pino(
    {
      level,
      base: undefined,
      // "level":"warn" and an ISO time read better, and filter more plainly, than pino's numbers.
      formatters: { level: (label) => ({ level: label }) },
      timestamp: pino.stdTimeFunctions.isoTime
    },
    destination
  )

/** Logs nothing and reads no games, for code run on its own. */
export const quietTelemetry = (): Telemetry => ({
  logger: createLogger("silent"),
  metrics: new Metrics(() => [])
})

export const createTelemetry = (logger: Logger, games: () => Game[]): Telemetry => ({
  logger,
  metrics: new Metrics(games)
})
