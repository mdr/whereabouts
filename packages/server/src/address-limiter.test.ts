import { describe, expect, it } from "vite-plus/test"
import { AddressLimiter } from "./address-limiter.ts"
import { quietTelemetry } from "./telemetry/telemetry.ts"

const limiter = (
  limits = { maxOpen: 3, burst: 5, perSecond: 1 }
): { addressLimiter: AddressLimiter; advance: (ms: number) => number } => {
  let now = 0
  const addressLimiter = new AddressLimiter(quietTelemetry(), limits, () => now)
  return { addressLimiter, advance: (ms: number) => (now += ms) }
}

describe("AddressLimiter", () => {
  it("refuses an address with too many connections open, until one closes", () => {
    const { addressLimiter } = limiter()
    expect([1, 2, 3].map(() => addressLimiter.check("a"))).toEqual([true, true, true])
    expect(addressLimiter.check("a")).toBe(false)
    expect(addressLimiter.check("b")).toBe(true)
    addressLimiter.release("a")
    expect(addressLimiter.check("a")).toBe(true)
  })

  it("refuses an address connecting too often, until its allowance refills", () => {
    const { addressLimiter, advance } = limiter({ maxOpen: 100, burst: 2, perSecond: 1 })
    expect(addressLimiter.check("a")).toBe(true)
    expect(addressLimiter.check("a")).toBe(true)
    expect(addressLimiter.check("a")).toBe(false)
    advance(1000)
    expect(addressLimiter.check("a")).toBe(true)
  })

  it("forgets addresses with nothing open once their allowance is full", () => {
    const { addressLimiter, advance } = limiter()
    addressLimiter.check("a")
    addressLimiter.release("a")
    advance(61_000)
    addressLimiter.check("b")
    expect(addressLimiter.openFrom("a")).toBe(0)
    expect(addressLimiter.openFrom("b")).toBe(1)
  })
})
