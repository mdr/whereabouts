import { describe, expect, it } from "vite-plus/test"
import {
  ClientErrorKind,
  ClientErrorReportSchema,
  MAX_MESSAGE_LENGTH,
  MAX_STACK_LENGTH
} from "@whereabouts/shared/protocol/client-error"
import { buildReport, mapFailureKind, scrubUrls } from "./build-report"
import { MAX_REPORTS_PER_PAGE, ReportGate } from "./report-gate"

const page = { hash: "#/solo", scripts: [] }

describe("ReportGate", () => {
  const report = buildReport(ClientErrorKind.MAP_LOAD, new Error("offline"), page)

  it("drops a repeat of the same kind and message", () => {
    const gate = new ReportGate()
    expect(gate.admit(report)).toBe(true)
    expect(gate.admit(report)).toBe(false)
    expect(gate.admit({ ...report, kind: ClientErrorKind.VR_LOAD })).toBe(true)
  })

  it("sends at most so many in a page load", () => {
    const gate = new ReportGate()
    const sent = Array.from({ length: MAX_REPORTS_PER_PAGE + 5 }, (_, i) =>
      gate.admit({ ...report, message: `failure ${i}` })
    )
    expect(sent.filter(Boolean)).toHaveLength(MAX_REPORTS_PER_PAGE)
  })
})

describe("buildReport", () => {
  it("names the screen without its query, and the room on a game screen", () => {
    expect(buildReport(ClientErrorKind.UNCAUGHT, "x", { hash: "#/solo?dev", scripts: [] }).screen).toBe("/solo")
    expect(buildReport(ClientErrorKind.UNCAUGHT, "x", { hash: "#/game/abcd", scripts: [] })).toMatchObject({
      screen: "/game/abcd",
      room: "ABCD"
    })
    expect(buildReport(ClientErrorKind.UNCAUGHT, "x", { hash: "", scripts: [] })).toMatchObject({ screen: "/" })
  })

  it("names the build by the bundle's hashed file", () => {
    const scripts = ["", "https://x.dev/assets/index-Ab12.js", "https://x.dev/assets/other.js"]
    expect(buildReport(ClientErrorKind.UNCAUGHT, "x", { hash: "", scripts }).build).toBe("index-Ab12.js")
    expect(buildReport(ClientErrorKind.UNCAUGHT, "x", { hash: "", scripts: ["/src/main.tsx"] }).build).toBeUndefined()
  })

  it("cuts the message and stack to what the server accepts", () => {
    const error = new Error("m".repeat(2000))
    error.stack = "s".repeat(5000)
    const report = buildReport(ClientErrorKind.UNCAUGHT, error, page)
    expect(report.message).toHaveLength(MAX_MESSAGE_LENGTH)
    expect(report.stack).toHaveLength(MAX_STACK_LENGTH)
    expect(ClientErrorReportSchema.safeParse(report).success).toBe(true)
  })

  it("reports anything thrown", () => {
    expect(buildReport(ClientErrorKind.UNCAUGHT, undefined, page).message).toBe("non-error thrown")
    expect(buildReport(ClientErrorKind.UNCAUGHT, "plain", page).message).toBe("plain")
  })
})

describe("scrubUrls", () => {
  it("drops query strings and fragments from URLs", () => {
    expect(scrubUrls("fetch https://a.dev/x.json?token=1&y=2 failed; also http://b.dev/p#frag now")).toBe(
      "fetch https://a.dev/x.json failed; also http://b.dev/p now"
    )
  })
})

describe("mapFailureKind", () => {
  it("tells a browser without WebGL from a map that would not download", () => {
    expect(mapFailureKind(new Error("Failed to initialize WebGL"))).toBe(ClientErrorKind.WEBGL)
    expect(mapFailureKind(new Error("Failed to fetch"))).toBe(ClientErrorKind.MAP_LOAD)
  })
})
