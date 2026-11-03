import { existsSync } from "node:fs"
import { createApp, type App, type AppOptions } from "./app.ts"
import { configFromEnv } from "./config.ts"
import { configureGameRooms } from "./rooms.ts"

/** The app the environment describes, not yet listening. */
export const createAppFromEnvironment = (
  env: Record<string, string | undefined>,
  defaultStaticDir: string,
  options: Pick<AppOptions, "logger" | "logLevel"> = {}
): { app: App; port: number; host: string; staticDir: string | undefined } => {
  const config = configFromEnv(env, defaultStaticDir)
  configureGameRooms({ config: config.game })
  const staticDir = config.staticDir && existsSync(config.staticDir) ? config.staticDir : undefined
  const app = createApp({
    ...options,
    staticDir,
    addressLimits: config.addressLimits,
    devTools: config.devTools
  })
  return { app, port: config.port, host: config.host, staticDir }
}
