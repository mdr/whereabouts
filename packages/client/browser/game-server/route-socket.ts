import type { BrowserContext, WebSocketRoute } from "@playwright/test"

/** Browsers may close a socket only with 1000 or 3000–4999. */
const closableWith = (code: number): number | undefined =>
  code === 1000 || (code >= 3000 && code < 5000) ? code : undefined

/** One tab's game connection, which a test can cut and give back. */
export class GameConnection {
  #down = false
  readonly #open = new Set<() => void>()

  get isDown(): boolean {
    return this.#down
  }

  /** Close the open socket, and turn away new ones until `restore`. */
  cut(): void {
    this.#down = true
    for (const close of this.#open) close()
  }

  restore(): void {
    this.#down = false
  }

  /** Let the socket be cut; the returned function stops that. */
  track(close: () => void): () => void {
    this.#open.add(close)
    return () => void this.#open.delete(close)
  }
}

/** Send the tabs' game socket to `socketUrl` instead of the dev server's proxy, frame for frame. */
export const routeGameSocket = async (context: BrowserContext, socketUrl: string): Promise<GameConnection> => {
  const connection = new GameConnection()
  await context.routeWebSocket(/\/ws$/, (route: WebSocketRoute) => {
    if (connection.isDown) return void route.close()
    const upstream = new WebSocket(socketUrl, route.protocols())
    upstream.binaryType = "arraybuffer"
    const early: (string | Uint8Array<ArrayBuffer>)[] = []
    const untrack = connection.track(() => {
      void route.close()
      upstream.close()
    })
    route.onMessage((message) => {
      const frame = typeof message === "string" ? message : Uint8Array.from(message)
      if (upstream.readyState === WebSocket.OPEN) upstream.send(frame)
      else early.push(frame)
    })
    upstream.addEventListener("open", () => {
      for (const message of early.splice(0)) upstream.send(message)
    })
    upstream.addEventListener("message", ({ data }: MessageEvent<string | ArrayBuffer>) =>
      route.send(typeof data === "string" ? data : Buffer.from(data))
    )
    upstream.addEventListener("close", ({ code, reason }) => {
      untrack()
      void route.close({ code, reason })
    })
    route.onClose((code) => {
      untrack()
      upstream.close(code === undefined ? undefined : closableWith(code), undefined)
    })
  })
  return connection
}

/** For tabs that never join a game: their game socket is closed at once. */
export const refuseGameSocket = async (context: BrowserContext): Promise<void> => {
  await context.routeWebSocket(/\/ws$/, (route) => void route.close())
}
