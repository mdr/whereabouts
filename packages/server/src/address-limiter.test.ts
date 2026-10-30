import { describe, expect, it } from "vite-plus/test"
import { AddressLimiter } from "./address-limiter.ts"

function limiter(limits = { maxOpen: 3, burst: 5, perSecond: 1 }) {
  let now = 0
  const l = new AddressLimiter(limits, () => now)
  return { l, advance: (ms: number) => (now += ms) }
}

describe("AddressLimiter", () => {
  it("refuses an address with too many connections open, until one closes", () => {
    const { l } = limiter()
    expect([1, 2, 3].map(() => l.check("a"))).toEqual([true, true, true])
    expect(l.check("a")).toBe(false)
    expect(l.check("b")).toBe(true)
    l.release("a")
    expect(l.check("a")).toBe(true)
  })

  it("refuses an address connecting too often, until its allowance refills", () => {
    const { l, advance } = limiter({ maxOpen: 100, burst: 2, perSecond: 1 })
    expect(l.check("a")).toBe(true)
    expect(l.check("a")).toBe(true)
    expect(l.check("a")).toBe(false)
    advance(1000)
    expect(l.check("a")).toBe(true)
  })

  it("forgets addresses with nothing open once their allowance is full", () => {
    const { l, advance } = limiter()
    l.check("a")
    l.release("a")
    advance(61_000)
    l.check("b")
    expect(l.openFrom("a")).toBe(0)
    expect(l.openFrom("b")).toBe(1)
  })
})
