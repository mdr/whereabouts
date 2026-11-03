/**
 * Builds the Fastify app and the Rivalis game server on its underlying
 * http.Server. Exported as a factory so tests can start it on port 0.
 */
import path from "node:path"
import { fileURLToPath } from "node:url"
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from "fastify"
import fastifyStatic from "@fastify/static"
import { Rivalis, TokenBucketRateLimiter, type RoomManager } from "@rivalis/core"
import type { Game } from "@whereabouts/shared/game/game"
import type { Logger } from "pino"
import WSTransport from "./vendor/WSTransport.ts"
import { GameAuth } from "./game-auth.ts"
import { GameRoom, ROOM_TYPE, gameRoomFor, kickForRestart, type ActorData } from "./rooms.ts"
import { registerDevPlayers } from "./extra-players/dev-players-route.ts"
import { registerClientErrors, type ClientErrorLimits } from "./client-errors/client-errors-route.ts"
import { AddressLimiter, type AddressLimits } from "./address-limiter.ts"
import { logEvent } from "./telemetry/log-event.ts"
import { LOG_CODES } from "./telemetry/log-codes.ts"
import { RefusalReason, SERVER_ERROR_KIND_TEXT, ServerErrorKind, type Metrics } from "./telemetry/metrics.ts"
import { serveMetrics, type MetricsServer } from "./telemetry/metrics-server.ts"
import { pinoLoggingFactory } from "./telemetry/pino-reporter.ts"
import { requestLogLevel } from "./telemetry/request-log-filter.ts"
import { createLogger, createTelemetry, type Telemetry } from "./telemetry/telemetry.ts"

export interface AppOptions {
  /** Directory of built client files to serve, or undefined for API-only (dev, behind Vite). */
  staticDir: string | undefined
  allowedOrigins?: string[]
  /** Where every log line goes, Rivalis's included; silent by default. */
  logger?: Logger
  /** Serve Prometheus metrics on this port (0 for any), apart from the public service; off by default. */
  metricsPort?: number
  clientErrorLimits?: ClientErrorLimits
  /** The commit the server was built from; "dev" by default. */
  build?: string
  /** Where room codes' letters come from; Math.random by default. */
  random?: () => number
  addressLimits?: AddressLimits
  /** Registers the playtest endpoints; never in production. */
  devTools?: boolean
  /** How often idle sockets are pinged; for tests. */
  heartbeatIntervalMs?: number
  /** What may queue unread for one socket before it is dropped; for tests. */
  maxBufferedBytes?: number
}

export interface App {
  fastify: FastifyInstance
  rivalis: Rivalis<ActorData>
  /** Log events with logEvent(logger, ...); count things by adding to metrics.registry. */
  logger: Logger
  metrics: Metrics
  listen(port: number, host?: string): Promise<string>
  /** Where the metrics are served, once listening and if asked for. */
  metricsAddress(): string | undefined
  close(): Promise<void>
}

/**
 * The largest message a client may send. Paint at the cell budget is about
 * 72 KiB; every other message is under 1 KiB. Kept close to that, since
 * junk JSON costs the time to parse it before it can be refused.
 */
export const MAX_PAYLOAD_BYTES = 128 * 1024
/**
 * Above the largest message, a reveal at the paint budget (about 1.5 MiB), so
 * only a client that has fallen behind is dropped; low enough that a full room
 * of stalled sockets stays well inside the machine's 256 MB.
 */
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024

/**
 * Rivalis's per-connection message limit, but logged when it closes a
 * connection, so a flood shows. A player sends paint at most every 400 ms;
 * the burst is for a host clicking through the lobby's settings.
 */
class LoggedRateLimiter extends TokenBucketRateLimiter {
  private telemetry: Telemetry
  /** Logged already: messages still in flight are refused too. */
  private closing = new Set<string>()

  constructor(telemetry: Telemetry, options: ConstructorParameters<typeof TokenBucketRateLimiter>[0]) {
    super(options)
    this.telemetry = telemetry
  }

  override check(actorId: string): boolean {
    const ok = super.check(actorId)
    if (!ok && !this.closing.has(actorId)) {
      this.closing.add(actorId)
      this.telemetry.metrics.countRefusal(RefusalReason.MESSAGE_RATE_LIMIT)
      logEvent(
        this.telemetry.logger,
        LOG_CODES.connection.rateLimited,
        `closing ${actorId}: over the message limit`,
        { actorId },
        "warn"
      )
    }
    return ok
  }

  override release(actorId: string): void {
    super.release(actorId)
    this.closing.delete(actorId)
  }
}

export const createApp = (options: AppOptions): App => {
  const logger = options.logger ?? createLogger("silent")
  let rivalis: Rivalis<ActorData> | undefined = undefined
  const rooms = (): RoomManager<ActorData> => {
    if (!rivalis) throw new Error("rivalis not ready")
    return rivalis.rooms
  }
  const telemetry = createTelemetry(logger, () =>
    [...rooms().keys()].flatMap((id): Game[] => {
      const room = rooms().get(id)
      return room instanceof GameRoom ? [room.state] : []
    })
  )
  const fastifyLogger: FastifyBaseLogger = logger
  // Requests are logged below, only the interesting ones.
  const fastify = Fastify({
    loggerInstance: fastifyLogger,
    logController: new LogController({ disableRequestLogging: true })
  })
  fastify.addHook("onError", (request, _reply, error, done) => {
    if ((error.statusCode ?? 500) >= 500) {
      telemetry.metrics.countServerError(ServerErrorKind.REQUEST_FAILED)
      logEvent(
        logger,
        LOG_CODES.server.error,
        `${request.method} ${request.url} failed`,
        { kind: SERVER_ERROR_KIND_TEXT[ServerErrorKind.REQUEST_FAILED], path: request.url, err: error },
        "error"
      )
    }
    done()
  })
  fastify.addHook("onResponse", (request, reply, done) => {
    const path = request.url.split("?")[0] ?? request.url
    const level = requestLogLevel(path, reply.statusCode)
    if (level)
      logEvent(
        logger,
        LOG_CODES.request.completed,
        `${request.method} ${path} ${reply.statusCode}`,
        { method: request.method, path, statusCode: reply.statusCode, responseMs: Math.round(reply.elapsedTime) },
        level
      )
    done()
  })

  const build = options.build ?? "dev"
  telemetry.metrics.buildInfo.set({ build }, 1)
  fastify.get("/api/health", () => ({ ok: true, build }))
  registerClientErrors(fastify, telemetry, options.clientErrorLimits)

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
      setHeaders(response, filePath) {
        response.setHeader("Cache-Control", cacheControlFor(filePath))
      }
    })
    // Single-page app: unknown paths fall through to index.html. Not a
    // missing asset, though: a 404 tells an old tab a newer build is out.
    fastify.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/assets/") ? reply.code(404).send() : reply.sendFile("index.html")
    )
  }

  if (options.devTools) {
    registerDevPlayers(
      fastify,
      (code, change) => {
        const room = rooms().get(code)
        return room instanceof GameRoom ? room.act(change) : undefined
      },
      Math.random
    )
  }
  const transport = new WSTransport({ server: fastify.server, path: "/ws" }, undefined, {
    maxPayload: MAX_PAYLOAD_BYTES,
    maxBufferedBytes: options.maxBufferedBytes ?? MAX_BUFFERED_BYTES,
    ...(options.heartbeatIntervalMs === undefined ? {} : { heartbeat: { intervalMs: options.heartbeatIntervalMs } }),
    connectionLimiter: new AddressLimiter(telemetry, options.addressLimits),
    ticketSource: "protocol",
    allowedOrigins: options.allowedOrigins ?? (() => true),
    onHandleMessageRejected: () => telemetry.metrics.countServerError(ServerErrorKind.HANDLE_MESSAGE_REJECTED)
  })
  rivalis = new Rivalis<ActorData>({
    transports: [transport],
    authMiddleware: new GameAuth(rooms, telemetry, options.random),
    rateLimiter: new LoggedRateLimiter(telemetry, { capacity: 30, refillPerSecond: 5 }),
    logging: pinoLoggingFactory(logger),
    maxPayloadBytes: MAX_PAYLOAD_BYTES
  })
  rivalis.rooms.define(ROOM_TYPE, gameRoomFor(telemetry))

  let metricsServer: MetricsServer | undefined = undefined
  return {
    fastify,
    rivalis,
    logger,
    metrics: telemetry.metrics,
    async listen(port, host = "127.0.0.1") {
      const address = await fastify.listen({ port, host })
      if (options.metricsPort !== undefined)
        metricsServer = await serveMetrics(telemetry.metrics.registry, options.metricsPort, host)
      return address
    },
    metricsAddress: () => metricsServer?.address,
    async close() {
      kickForRestart(rivalis.rooms)
      await rivalis.shutdown({ timeoutMs: 2000 })
      await fastify.close()
      await metricsServer?.close()
    }
  }
}

/** Hashed bundle assets are immutable; everything else must be revalidated. */
const cacheControlFor = (filePath: string): string =>
  /[/\\]assets[/\\]/.test(filePath) ? "public, max-age=31536000, immutable" : "no-cache"

export const defaultStaticDir = (): string => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, "../../client/dist")
}
