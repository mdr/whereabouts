import { describe, expect, it } from "vite-plus/test"
import { FakeClock } from "@whereabouts/shared/test-support/fake-clock"
import {
  MAX_RECORDS_PER_BATCH,
  TelemetryBatchSchema,
  TelemetryLevel,
  type TelemetryBatch
} from "@whereabouts/shared/protocol/client-telemetry"
import { ANALYTICS_CODES, WEB_LOG_CODES } from "@whereabouts/shared/telemetry/web-codes"
import { Analytics } from "./analytics"
import { createLogger, type Logger } from "./logger"
import { FLUSH_AT, FLUSH_DELAY, TelemetryShipper, type RecordContext, type ShipperOptions } from "./shipper"

interface ShipperFixture {
  clock: FakeClock
  sent: TelemetryBatch[]
  shipper: TelemetryShipper
  logger: Logger
  analytics: Analytics
}

const makeShipper = ({
  context = { screen: "/" },
  send
}: { context?: RecordContext; send?: ShipperOptions["send"] } = {}): ShipperFixture => {
  const clock = new FakeClock({ frozenAt: 1_000 })
  const sent: TelemetryBatch[] = []
  const shipper = new TelemetryShipper({
    clock,
    session: "s1",
    build: "b1",
    context: () => context,
    send: send ?? ((batch) => sent.push(batch))
  })
  const logger = createLogger(clock, [shipper.sink])
  return { clock, sent, shipper, logger, analytics: new Analytics(logger) }
}

describe("TelemetryShipper", () => {
  it("sends a batch the server takes a moment after the first record, saying where the tab was", () => {
    const { clock, sent, analytics } = makeShipper({
      context: { screen: "/game/ABCD", room: "ABCD", playerId: "p2" }
    })
    analytics.track(ANALYTICS_CODES.paint.cleared, "cleared the paint")
    clock.advance(FLUSH_DELAY - 1)
    expect(sent).toEqual([])
    clock.advance(1)
    expect(sent).toHaveLength(1)
    expect(TelemetryBatchSchema.safeParse(sent[0]).success).toBe(true)
    expect(sent[0]!.records[0]).toMatchObject({
      at: 1_000,
      level: TelemetryLevel.INFO,
      code: ANALYTICS_CODES.paint.cleared,
      screen: "/game/ABCD",
      room: "ABCD",
      playerId: "p2"
    })
  })

  it("sends at once when a batch's worth has queued, and never more than a batch holds", () => {
    const { sent, analytics } = makeShipper()
    for (let i = 0; i < FLUSH_AT; i++) analytics.track(ANALYTICS_CODES.paint.undone, "undid")
    expect(sent).toHaveLength(1)
    expect(sent[0]!.records).toHaveLength(FLUSH_AT)
    expect(FLUSH_AT).toBeLessThanOrEqual(MAX_RECORDS_PER_BATCH)
  })

  it("keeps DEBUG to the console", () => {
    const { sent, shipper, logger } = makeShipper()
    logger.debug(WEB_LOG_CODES.app.started, "started")
    shipper.flush()
    expect(sent).toEqual([])
  })

  it("keeps a record the server would take: long text cut, bad field names left out", () => {
    const { sent, shipper, logger } = makeShipper()
    logger.info(WEB_LOG_CODES.map.created, "x".repeat(500), { ok: "y".repeat(500), "Bad name": 1, gone: undefined })
    shipper.flush()
    expect(TelemetryBatchSchema.safeParse(sent[0]).success).toBe(true)
    expect(sent[0]!.records[0]!.fields).toEqual({ ok: "y".repeat(100) })
  })

  it("lets a batch go when sending fails, and carries on", () => {
    const { shipper, logger } = makeShipper({
      send: () => {
        throw new Error("offline")
      }
    })
    expect(() => {
      for (let i = 0; i < FLUSH_AT * 3; i++) logger.info(WEB_LOG_CODES.map.created, "map")
      shipper.flush()
    }).not.toThrow()
  })
})
