/**
 * Where players' browsers report what failed in them, so it reaches the
 * server logs. It answers 204 even when it drops a report, so a client
 * learns nothing and never retries; only a malformed body is refused.
 */
import type { FastifyInstance } from "fastify"
import { CLIENT_ERRORS_PATH, ClientErrorReportSchema } from "@whereabouts/shared/protocol/client-error"
import type { Instant } from "@whereabouts/shared/units"
import { clientAddress } from "../vendor/WSTransport.ts"
import { KeyedTokenBucket, type BucketLimits } from "./token-bucket.ts"
import { logEvent } from "../telemetry/log-event.ts"
import { LOG_CODES } from "../telemetry/log-codes.ts"
import type { Telemetry } from "../telemetry/telemetry.ts"

export interface ClientErrorLimits {
  /** Reports from one address. */
  perAddress: BucketLimits
  /** Reports from everyone, so no number of clients can flood the logs. */
  global: BucketLimits
}

const DEFAULT_CLIENT_ERROR_LIMITS: ClientErrorLimits = {
  perAddress: { burst: 5, perSecond: 1 / 10 },
  global: { burst: 300, perSecond: 5 }
}

const BODY_LIMIT_BYTES = 8 * 1024
const USER_AGENT_LENGTH = 200
const EVERYONE = "everyone"

export const registerClientErrors = (
  fastify: FastifyInstance,
  { logger, metrics }: Telemetry,
  limits: ClientErrorLimits = DEFAULT_CLIENT_ERROR_LIMITS,
  now: () => Instant = Date.now
): void => {
  const perAddress = new KeyedTokenBucket(limits.perAddress, now)
  const global = new KeyedTokenBucket(limits.global, now)

  fastify.post(CLIENT_ERRORS_PATH, { bodyLimit: BODY_LIMIT_BYTES }, (request, reply) => {
    const address = clientAddress(request.raw)
    const own = perAddress.take(address)
    if (!own.allowed) {
      if (own.firstRefusal)
        logEvent(
          logger,
          LOG_CODES.clientError.rateLimited,
          `client errors from ${address} limited`,
          { address },
          "warn"
        )
      return reply.code(204).send()
    }
    const all = global.take(EVERYONE)
    if (!all.allowed) {
      if (all.firstRefusal)
        logEvent(
          logger,
          LOG_CODES.clientError.rateLimited,
          `client errors from ${address} limited`,
          { address: EVERYONE },
          "warn"
        )
      return reply.code(204).send()
    }
    const report = ClientErrorReportSchema.safeParse(request.body)
    if (!report.success) return reply.code(400).send({ error: "invalid body" })
    metrics.clientErrors.inc({ kind: report.data.kind })
    // Every line already has the server's `build`; a tab left open across a deploy shows as a different clientBuild.
    const { build: clientBuild, ...fields } = report.data
    logEvent(
      logger,
      LOG_CODES.clientError.reported,
      `client error: ${report.data.kind}`,
      { ...fields, clientBuild, userAgent: request.headers["user-agent"]?.slice(0, USER_AGENT_LENGTH) },
      "warn"
    )
    return reply.code(204).send()
  })
}
