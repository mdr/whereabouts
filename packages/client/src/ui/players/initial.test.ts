import { describe, expect, it } from "vite-plus/test"
import { initial } from "./initial"

describe("initial", () => {
  it("upper-cases the first letter", () => {
    expect(initial("alice")).toBe("A")
  })

  it("keeps a multi-part emoji whole", () => {
    expect(initial("  🇫🇷 Marie")).toBe("🇫🇷")
    expect(initial("👨‍👩‍👧 family")).toBe("👨‍👩‍👧")
  })

  it("is a question mark for a blank name", () => {
    expect(initial("   ")).toBe("?")
  })
})
