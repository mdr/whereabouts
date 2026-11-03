import { describe, expect, it } from "vite-plus/test"
import { requestLogLevel } from "./request-log-filter.ts"

describe("requestLogLevel", () => {
  it("leaves out health checks and files served fine", () => {
    expect(requestLogLevel("/api/health", 200)).toBeUndefined()
    expect(requestLogLevel("/assets/index-abc.js", 200)).toBeUndefined()
    expect(requestLogLevel("/", 200)).toBeUndefined()
    expect(requestLogLevel("/some/app/route", 200)).toBeUndefined()
  })

  it("logs other API requests", () => {
    expect(requestLogLevel("/api/client-error", 204)).toBe("info")
    expect(requestLogLevel("/api/unknown", 404)).toBe("info")
  })

  it("logs a missing bundle file, which an old tab asks for after a deploy", () => {
    expect(requestLogLevel("/assets/index-old.js", 404)).toBe("info")
  })

  it("logs a server error on any path, even a health check", () => {
    expect(requestLogLevel("/api/health", 500)).toBe("error")
    expect(requestLogLevel("/", 503)).toBe("error")
  })
})
