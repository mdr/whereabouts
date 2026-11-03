import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vite-plus/test"

const JAVASCRIPT = /\.(js|mjs|cjs|jsx)$/
const VENDORED = /(^|\/)vendor\//

describe("the repository's code", () => {
  it("is TypeScript, not JavaScript, scripts included", () => {
    const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n")
    expect(tracked.filter((file) => JAVASCRIPT.test(file) && !VENDORED.test(file))).toEqual([])
  })
})
