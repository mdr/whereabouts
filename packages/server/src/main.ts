import { defaultStaticDir } from "./app.ts"
import { createAppFromEnvironment } from "./environment-app.ts"

const { app, port, host, staticDir } = createAppFromEnvironment(process.env, defaultStaticDir(), { logger: true })

const address = await app.listen(port, host)
app.fastify.log.info(`whereabouts server on ${address} (static: ${staticDir ?? "none"})`)

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0))
  })
}
