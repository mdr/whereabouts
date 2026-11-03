import { describe, expect, it } from "vite-plus/test"
import { LOG_CODES } from "./log-codes.ts"

describe("LOG_CODES", () => {
  it("values each code with its own path, so a code in the logs leads back to its constant", () => {
    for (const [group, codes] of Object.entries(LOG_CODES))
      for (const [event, code] of Object.entries(codes)) expect(code).toBe(`${group}.${event}`)
  })

  it("writes groups and events in lowerCamel", () => {
    for (const code of Object.values(LOG_CODES).flatMap((codes) => Object.values(codes)))
      expect(code).toMatch(/^[a-z][a-zA-Z]*\.[a-z][a-zA-Z]*$/)
  })
})
