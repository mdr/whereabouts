import { existsSync } from "node:fs"
import { createApp, type App, type AppOptions } from "./app.ts"
import { configFromEnv } from "./config.ts"
import { configureGameRooms } from "./rooms.ts"
import { createLogger } from "./telemetry/telemetry.ts"

/** The app the environment describes, not yet listening. Logs to stdout unless given a logger. */
export const createAppFromEnvironment = (
  env: Record<string, string | undefined>,
  defaultStaticDir: string,
  options: Pick<AppOptions, "logger"> = {}
): { app: App; port: number; host: string; staticDir: string | undefined } => {
  const config = configFromEnv(env, defaultStaticDir)
  configureGameRooms({ config: config.game })
  const staticDir = config.staticDir && existsSync(config.staticDir) ? config.staticDir : undefined
  const app = createApp({
    logger: options.logger ?? createLogger(config.logLevel),
    staticDir,
    addressLimits: config.addressLimits,
    devTools: config.devTools,
    metricsPort: config.metricsPort
  })
  return { app, port: config.port, host: config.host, staticDir }
}
