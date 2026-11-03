import { defaultStaticDir } from "./app.ts"
import { createAppFromEnvironment } from "./environment-app.ts"
import { LogEvent, logEvent } from "./telemetry/log-event.ts"

const { app, port, host, staticDir } = createAppFromEnvironment(process.env, defaultStaticDir())

const address = await app.listen(port, host)
logEvent(app.logger, LogEvent.SERVER_STARTED, { address, metricsAddress: app.metricsAddress(), staticDir })

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logEvent(app.logger, LogEvent.SERVER_STOPPING, { signal })
    void app.close().then(() => process.exit(0))
  })
}
