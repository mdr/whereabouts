import { describe, expect, it } from "vite-plus/test"
import { ANALYTICS_CODES, WEB_CODES, WEB_LOG_CODES } from "./web-codes.ts"

const REGISTRIES: Record<string, Record<string, Record<string, string>>> = { WEB_LOG_CODES, ANALYTICS_CODES }

describe("web codes", () => {
  it("are filed under the group their name says, so a code in the logs leads back to its constant", () => {
    for (const registry of Object.values(REGISTRIES))
      for (const [group, codes] of Object.entries(registry))
        for (const [event, code] of Object.entries(codes)) expect(code).toBe(`${group}.${event}`)
  })

  it("are written in lowerCamel", () => {
    for (const code of WEB_CODES) expect(code).toMatch(/^[a-z][a-zA-Z]*\.[a-z][a-zA-Z]*$/)
  })

  it("are each used once, across logs and analytics", () => {
    expect(new Set(WEB_CODES).size).toBe(WEB_CODES.length)
  })
})
