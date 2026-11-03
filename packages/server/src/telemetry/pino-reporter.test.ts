import { describe, expect, it } from "vite-plus/test"
import { createLogger } from "./telemetry.ts"
import { describeMessages, describeScope, factoryLevel, pinoLoggingFactory } from "./pino-reporter.ts"

describe("describeScope", () => {
  it("names a room's logger by its code, and any other by its component", () => {
    expect(describeScope("room=ABCD")).toEqual({ component: "room", room: "ABCD" })
    expect(describeScope("transport:websocket")).toEqual({ component: "transport:websocket" })
  })
})

describe("describeMessages", () => {
  it("makes objects fields, errors the err field, and the rest the message", () => {
    const error = new Error("boom")
    expect(describeMessages(["socket", "error", { actor: "a1" }, error, 3])).toEqual({
      fields: { actor: "a1", err: error },
      message: "socket error 3"
    })
  })
})

describe("factoryLevel", () => {
  it("maps pino's levels to the logging factory's", () => {
    expect(["trace", "debug", "info", "warn", "error", "silent"].map(factoryLevel)).toEqual([
      "verbose",
      "debug",
      "info",
      "warning",
      "error",
      "silent"
    ])
  })
})

describe("pinoLoggingFactory", () => {
  it("writes a named logger's lines as JSON at the matching level", () => {
    const lines: string[] = []
    const factory = pinoLoggingFactory(createLogger("info", { write: (text) => void lines.push(text) }))

    factory.getLogger("room=WXYZ").warning("tick slow", { ms: 40 })
    factory.getLogger("transport:websocket").debug("not wanted")

    expect(lines.map((line) => JSON.parse(line) as unknown)).toMatchObject([
      { level: "warn", component: "room", room: "WXYZ", ms: 40, msg: "tick slow" }
    ])
  })
})
