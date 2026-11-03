import { createServer, type Server } from "node:http"
import type { Registry } from "prom-client"

export interface MetricsServer {
  /** The address it listens on. */
  address: string
  close(): Promise<void>
}

/** Serves the registry at /metrics, on a port of its own so the public service never shows it. */
export const serveMetrics = async (registry: Registry, port: number, host: string): Promise<MetricsServer> => {
  const server: Server = createServer((request, response) => {
    if (request.url !== "/metrics") {
      response.writeHead(404).end()
      return
    }
    registry.metrics().then(
      (text) => response.writeHead(200, { "Content-Type": registry.contentType }).end(text),
      () => response.writeHead(500).end()
    )
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, host, resolve)
  })
  const bound = server.address()
  const address = typeof bound === "object" && bound ? `http://${host}:${bound.port}` : String(bound)
  return {
    address,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections()
      })
  }
}
