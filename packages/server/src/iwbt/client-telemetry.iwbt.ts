import { describe, expect } from "vite-plus/test"
import {
  TelemetryLevel,
  type TelemetryBatch,
  type TelemetryRecord
} from "@whereabouts/shared/protocol/client-telemetry"
import { ANALYTICS_CODES, WEB_LOG_CODES } from "@whereabouts/shared/telemetry/web-codes"
import type { InProcessServer } from "../test-support/in-process-server.ts"
import type { LogLine } from "../test-support/log-capture.ts"
import { useInProcessServer } from "../test-support/use-in-process-server.ts"
import { LOG_CODES } from "../telemetry/log-codes.ts"

const record: TelemetryRecord = {
  at: Date.UTC(2026, 10, 22, 19, 10, 30),
  level: TelemetryLevel.INFO,
  code: ANALYTICS_CODES.paint.trimmed,
  msg: "trimmed the paint",
  fields: { trim: "LAND", removedPercent: 85 },
  screen: "/game/ABCD",
  room: "ABCD",
  playerId: "p2"
}

const batch = (records: TelemetryRecord[] = [record]): TelemetryBatch => ({ session: "s1", build: "8722b07", records })

const limits = {
  perAddress: { burst: 2, perSecond: 0.001 },
  global: { burst: 3, perSecond: 0.001 }
}

const webLines = (server: InProcessServer): readonly LogLine[] =>
  server.logEvents.filter((line) => line["source"] === "web")

const limitedLines = (server: InProcessServer): readonly LogLine[] =>
  server.logEvents.filter((line) => line.code === LOG_CODES.clientTelemetry.rateLimited)

describe("client telemetry", () => {
  const it = useInProcessServer({ clientTelemetryLimits: limits })

  it("logs each record as a line of its own under its web code, with where the tab was, and answers 204", async ({
    server
  }) => {
    const started = { ...record, code: WEB_LOG_CODES.app.started, msg: "app started", fields: { touch: true } }
    expect(await server.postClientTelemetry(batch([started, record]), "10.0.0.1")).toBe(204)
    const lines = webLines(server)
    expect(lines).toMatchObject([
      { code: "app.started", level: "info", touch: true },
      {
        code: "paint.trimmed",
        level: "info",
        msg: "trimmed the paint",
        trim: "LAND",
        removedPercent: 85,
        session: "s1",
        clientBuild: "8722b07",
        clientAt: "2026-11-22T19:10:30.000Z",
        screen: "/game/ABCD",
        room: "ABCD",
        playerId: "p2"
      }
    ])
    expect(lines[0]!["userAgent"]).toBeDefined()
    expect(lines[1]!["userAgent"]).toBeUndefined()
  })

  it("keeps a browser's fields from replacing the line's own", async ({ server }) => {
    await server.postClientTelemetry(batch([{ ...record, fields: { code: "nav.screenOpened", room: "ZZZZ", ok: 1 } }]))
    expect(webLines(server)).toMatchObject([{ code: "paint.trimmed", room: "ABCD", ok: 1 }])
  })

  it("logs at the record's level", async ({ server }) => {
    await server.postClientTelemetry(
      batch([{ ...record, code: WEB_LOG_CODES.paint.reset, level: TelemetryLevel.WARN }])
    )
    expect(webLines(server)).toMatchObject([{ code: "paint.reset", level: "warn" }])
  })

  it("refuses a body that is not a batch, and logs nothing", async ({ server }) => {
    const bad: unknown[] = [
      { ...batch(), records: [] },
      batch([{ ...record, code: "made.up" as TelemetryRecord["code"] }]),
      batch([{ ...record, fields: { "Not camel": 1 } }]),
      batch([{ ...record, fields: { nested: { a: 1 } as unknown as number } }]),
      { ...batch(), token: "secret" }
    ]
    for (const body of bad) expect(await server.postClientTelemetry(body, "10.0.0.2")).toBe(400)
    expect(webLines(server)).toEqual([])
  })

  it("answers an address over its limit with 204, logging only that it is limited, once", async ({ server }) => {
    const statuses: number[] = []
    for (let count = 0; count < 5; count++) statuses.push(await server.postClientTelemetry(batch(), "10.0.0.3"))
    expect(statuses).toEqual([204, 204, 204, 204, 204])
    expect(webLines(server)).toHaveLength(2)
    expect(limitedLines(server)).toHaveLength(1)
  })

  it("holds a cap on all addresses together", async ({ server }) => {
    for (const address of ["10.0.1.1", "10.0.1.2", "10.0.1.3", "10.0.1.4", "10.0.1.5"])
      expect(await server.postClientTelemetry(batch(), address)).toBe(204)
    expect(webLines(server)).toHaveLength(3)
    expect(limitedLines(server)).toHaveLength(1)
  })
})
