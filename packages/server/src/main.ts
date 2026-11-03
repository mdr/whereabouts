import { defaultStaticDir } from "./app.ts"
import { createAppFromEnvironment } from "./environment-app.ts"
import { logEvent } from "./telemetry/log-event.ts"
import { LOG_CODES } from "./telemetry/log-codes.ts"

const { app, port, host, staticDir } = createAppFromEnvironment(process.env, defaultStaticDir())

const address = await app.listen(port, host)
logEvent(app.logger, LOG_CODES.server.started, `listening on ${address}`, {
  address,
  metricsAddress: app.metricsAddress(),
  staticDir
})

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logEvent(app.logger, LOG_CODES.server.stopping, `stopping on ${signal}`, { signal })
    void app.close().then(() => process.exit(0))
  })
}
