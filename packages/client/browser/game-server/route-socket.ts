import type { BrowserContext } from "@playwright/test"

/** Browsers may close a socket only with 1000 or 3000–4999. */
const closableWith = (code: number): number | undefined =>
  code === 1000 || (code >= 3000 && code < 5000) ? code : undefined

/** Send the tabs' game socket to `socketUrl` instead of the dev server's proxy, frame for frame. */
export const routeGameSocket = async (context: BrowserContext, socketUrl: string): Promise<void> => {
  await context.routeWebSocket(/\/ws$/, (route) => {
    const upstream = new WebSocket(socketUrl, route.protocols())
    upstream.binaryType = "arraybuffer"
    const early: (string | Uint8Array<ArrayBuffer>)[] = []
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
    upstream.addEventListener("close", ({ code, reason }) => void route.close({ code, reason }))
    route.onClose((code) => upstream.close(code === undefined ? undefined : closableWith(code), undefined))
  })
}
