import { describe, expect } from "vite-plus/test"
import { ClientErrorKind, type ClientErrorReport } from "@whereabouts/shared/protocol/client-error"
import type { InProcessServer } from "../test-support/in-process-server.ts"
import type { LogLine } from "../test-support/log-capture.ts"
import { useInProcessServer } from "../test-support/use-in-process-server.ts"

const report: ClientErrorReport = {
  kind: ClientErrorKind.MAP_LOAD,
  message: "could not load the map",
  screen: "/solo",
  build: "8722b07"
}

const limits = {
  perAddress: { burst: 2, perSecond: 0.001 },
  global: { burst: 3, perSecond: 0.001 }
}

const clientErrorEvents = (server: InProcessServer): readonly LogLine[] =>
  server.logEvents.filter((line) => String(line.code).startsWith("CLIENT_ERROR"))

describe("client error reports", () => {
  const it = useInProcessServer({ clientErrorLimits: limits })

  it("logs a valid report with its fields, its build as clientBuild beside the server's, and answers 204", async ({
    server
  }) => {
    expect(await server.postClientError({ ...report, stack: "at map.ts:1", room: "ABCD" }, "10.0.0.1")).toBe(204)
    expect(clientErrorEvents(server)).toMatchObject([
      {
        code: "CLIENT_ERROR",
        level: "warn",
        kind: report.kind,
        message: report.message,
        screen: report.screen,
        clientBuild: report.build,
        stack: "at map.ts:1",
        room: "ABCD"
      }
    ])
  })

  it("refuses a body that is not a report, and logs nothing", async ({ server }) => {
    expect(await server.postClientError({ ...report, kind: "NOT_A_KIND" }, "10.0.0.2")).toBe(400)
    expect(await server.postClientError({ ...report, message: "x".repeat(501) }, "10.0.0.4")).toBe(400)
    expect(await server.postClientError({ ...report, token: "secret" }, "10.0.0.5")).toBe(400)
    expect(clientErrorEvents(server)).toEqual([])
  })

  it("answers an address over its limit with 204, logging only that it is limited, once", async ({ server }) => {
    const statuses: number[] = []
    for (let count = 0; count < 5; count++) statuses.push(await server.postClientError(report, "10.0.0.3"))
    expect(statuses).toEqual([204, 204, 204, 204, 204])
    expect(clientErrorEvents(server).map((line) => line.code)).toEqual([
      "CLIENT_ERROR",
      "CLIENT_ERROR",
      "CLIENT_ERROR_RATE_LIMITED"
    ])
  })

  it("holds a cap on all addresses together", async ({ server }) => {
    for (const address of ["10.0.1.1", "10.0.1.2", "10.0.1.3", "10.0.1.4", "10.0.1.5"])
      expect(await server.postClientError(report, address)).toBe(204)
    const events = clientErrorEvents(server).map((line) => line.code)
    expect(events.filter((event) => event === "CLIENT_ERROR")).toHaveLength(3)
    expect(events.filter((event) => event === "CLIENT_ERROR_RATE_LIMITED")).toHaveLength(1)
  })
})
