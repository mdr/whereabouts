/**
 * Where players' browsers send their log and analytics records, each
 * written to the server's log as a line of its own, under its web code. It
 * answers 204 even when it drops a batch, so a client never retries; only a
 * malformed body is refused.
 */
import type { FastifyInstance } from "fastify"
import {
  CLIENT_TELEMETRY_PATH,
  TelemetryBatchSchema,
  TelemetryLevel,
  type TelemetryRecord
} from "@whereabouts/shared/protocol/client-telemetry"
import { WEB_LOG_CODES } from "@whereabouts/shared/telemetry/web-codes"
import type { Instant } from "@whereabouts/shared/units"
import { clientAddress } from "../vendor/WSTransport.ts"
import { KeyedTokenBucket, type BucketLimits } from "../client-errors/token-bucket.ts"
import { logEvent, type LogLevel } from "../telemetry/log-event.ts"
import { LOG_CODES } from "../telemetry/log-codes.ts"
import type { Telemetry } from "../telemetry/telemetry.ts"

export interface ClientTelemetryLimits {
  /** Batches from one address: a tab sends one every few seconds while a player is busy. */
  perAddress: BucketLimits
  /** Batches from everyone, so no number of clients can flood the logs. */
  global: BucketLimits
}

const DEFAULT_CLIENT_TELEMETRY_LIMITS: ClientTelemetryLimits = {
  perAddress: { burst: 20, perSecond: 1 / 2 },
  global: { burst: 500, perSecond: 50 }
}

const BODY_LIMIT_BYTES = 64 * 1024
const USER_AGENT_LENGTH = 200
const EVERYONE = "everyone"

const LEVEL: Record<TelemetryLevel, LogLevel> = {
  [TelemetryLevel.ERROR]: "error",
  [TelemetryLevel.WARN]: "warn",
  [TelemetryLevel.INFO]: "info",
  // A client never sends DEBUG; should one arrive, it is kept at the lowest level the log has.
  [TelemetryLevel.DEBUG]: "info"
}

/** The line's own fields, and pino's, which a browser's fields may not replace. */
const RESERVED = new Set([
  "code",
  "msg",
  "time",
  "level",
  "pid",
  "hostname",
  "build",
  "component",
  "err",
  "source",
  "session",
  "clientBuild",
  "clientAt",
  "screen",
  "room",
  "playerId",
  "userAgent"
])

const ownFields = (fields: TelemetryRecord["fields"]): TelemetryRecord["fields"] =>
  Object.fromEntries(Object.entries(fields).filter(([name]) => !RESERVED.has(name)))

export const registerClientTelemetry = (
  fastify: FastifyInstance,
  { logger }: Pick<Telemetry, "logger">,
  limits: ClientTelemetryLimits = DEFAULT_CLIENT_TELEMETRY_LIMITS,
  now: () => Instant = Date.now
): void => {
  const perAddress = new KeyedTokenBucket(limits.perAddress, now)
  const global = new KeyedTokenBucket(limits.global, now)

  const limited = (address: string): void =>
    logEvent(
      logger,
      LOG_CODES.clientTelemetry.rateLimited,
      `client telemetry from ${address} limited`,
      { address },
      "warn"
    )

  fastify.post(CLIENT_TELEMETRY_PATH, { bodyLimit: BODY_LIMIT_BYTES }, (request, reply) => {
    // Invalid bodies are refused first and never logged, so no flood of them can write to the log.
    const batch = TelemetryBatchSchema.safeParse(request.body)
    if (!batch.success) return reply.code(400).send({ error: "invalid body" })
    const address = clientAddress(request.raw)
    const own = perAddress.take(address)
    if (!own.allowed) {
      if (own.firstRefusal) limited(address)
      return reply.code(204).send()
    }
    const all = global.take(EVERYONE)
    if (!all.allowed) {
      if (all.firstRefusal) limited(EVERYONE)
      return reply.code(204).send()
    }
    const { session, build: clientBuild, records } = batch.data
    for (const { at, level, code, msg, fields, screen, room, playerId } of records)
      logEvent(
        logger,
        code,
        msg,
        {
          ...ownFields(fields),
          source: "web",
          session,
          clientBuild,
          clientAt: new Date(at).toISOString(),
          screen,
          room,
          playerId,
          // Once a page load, to tell devices and browsers apart.
          ...(code === WEB_LOG_CODES.app.started
            ? { userAgent: request.headers["user-agent"]?.slice(0, USER_AGENT_LENGTH) }
            : {})
        },
        LEVEL[level]
      )
    return reply.code(204).send()
  })
}
