/**
 * Builds the Fastify app and the Rivalis game server on its underlying
 * http.Server. Exported as a factory so tests can start it on port 0.
 */
import path from "node:path"
import { fileURLToPath } from "node:url"
import Fastify, { type FastifyInstance } from "fastify"
import fastifyStatic from "@fastify/static"
import { Rivalis, TokenBucketRateLimiter, logging } from "@rivalis/core"
import WSTransport from "./vendor/WSTransport.ts"
import { GameAuth, GameRoom, ROOM_TYPE, type ActorData } from "./rooms.ts"
import { AddressLimiter, type AddressLimits } from "./address-limiter.ts"

export interface AppOptions {
  /** Directory of built client files to serve, or undefined for API-only (dev, behind Vite). */
  staticDir: string | undefined
  allowedOrigins?: string[]
  logger?: boolean
  /** Rivalis log level; defaults to info. */
  logLevel?: Rivalis["logging"]["level"]
  addressLimits?: AddressLimits
}

export interface App {
  fastify: FastifyInstance
  rivalis: Rivalis<ActorData>
  listen(port: number, host?: string): Promise<string>
  close(): Promise<void>
}

/**
 * The largest message a client may send. Paint at the cell budget is about
 * 72 KiB; every other message is under 1 KiB. Kept close to that, since
 * junk JSON costs the time to parse it before it can be refused.
 */
const MAX_PAYLOAD_BYTES = 128 * 1024
/** Above the largest message, a reveal at the paint budget, so only a client that has fallen behind is dropped. */
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024

/**
 * Rivalis's per-connection message limit, but logged when it closes a
 * connection, so a flood shows. A player sends paint at most every 400 ms;
 * the burst is for a host clicking through the lobby's settings.
 */
class LoggedRateLimiter extends TokenBucketRateLimiter {
  private logger = logging.getLogger("rate limit")
  /** Logged already: messages still in flight are refused too. */
  private closing = new Set<string>()

  override check(actorId: string): boolean {
    const ok = super.check(actorId)
    if (!ok && !this.closing.has(actorId)) {
      this.closing.add(actorId)
      this.logger.warning(`closing ${actorId}: over the message limit`)
    }
    return ok
  }

  override release(actorId: string): void {
    super.release(actorId)
    this.closing.delete(actorId)
  }
}

export function createApp(options: AppOptions): App {
  const fastify = Fastify({ logger: options.logger ?? false })

  fastify.get("/api/health", () => ({ ok: true }))

  if (options.staticDir) {
    // Vite names bundled assets by content hash, so they can be cached for
    // good; index.html must always be revalidated or a stale copy would point
    // at assets a later deploy no longer has. File mtimes are meaningless in
    // an immutable image (Nix sets them to the epoch), so no ETag or
    // Last-Modified: a same-sized index.html would otherwise look unchanged.
    fastify.register(fastifyStatic, {
      root: options.staticDir,
      wildcard: false,
      etag: false,
      lastModified: false,
      cacheControl: false,
      setHeaders(res, filePath) {
        res.setHeader("Cache-Control", cacheControlFor(filePath))
      }
    })
    // Single-page app: unknown paths fall through to index.html.
    fastify.setNotFoundHandler((_req, reply) => reply.sendFile("index.html"))
  }

  let rivalis: Rivalis<ActorData> | undefined = undefined
  const rooms = () => {
    if (!rivalis) throw new Error("rivalis not ready")
    return rivalis.rooms
  }
  const transport = new WSTransport({ server: fastify.server, path: "/ws" }, undefined, {
    maxPayload: MAX_PAYLOAD_BYTES,
    maxBufferedBytes: MAX_BUFFERED_BYTES,
    connectionLimiter: new AddressLimiter(options.addressLimits),
    ticketSource: "protocol",
    allowedOrigins: options.allowedOrigins ?? (() => true)
  })
  rivalis = new Rivalis<ActorData>({
    transports: [transport],
    authMiddleware: new GameAuth(rooms),
    rateLimiter: new LoggedRateLimiter({ capacity: 30, refillPerSecond: 5 }),
    maxPayloadBytes: MAX_PAYLOAD_BYTES
  })
  if (options.logLevel) rivalis.logging.level = options.logLevel
  rivalis.rooms.define(ROOM_TYPE, GameRoom)

  return {
    fastify,
    rivalis,
    async listen(port, host = "127.0.0.1") {
      const address = await fastify.listen({ port, host })
      return address
    },
    async close() {
      await rivalis.shutdown({ timeoutMs: 2000 })
      await fastify.close()
    }
  }
}

/** Hashed bundle assets are immutable; everything else must be revalidated. */
function cacheControlFor(filePath: string): string {
  return /[/\\]assets[/\\]/.test(filePath) ? "public, max-age=31536000, immutable" : "no-cache"
}

export function defaultStaticDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, "../../client/dist")
}
