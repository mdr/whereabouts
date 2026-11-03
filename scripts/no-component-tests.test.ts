import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vite-plus/test"

const git = (...args: string[]): string[] =>
  execFileSync("git", args, { encoding: "utf8" })
    .split("\n")
    .filter((line) => line !== "")

describe("the client's tests", () => {
  it("render no component on its own: UI behaviour is for IWFTs, logic for unit tests", () => {
    expect(git("ls-files", "*.test.tsx")).toEqual([])
  })

  it("use testing-library only to drive hooks", () => {
    const rendering = /import\s*{[^}]*\b(render|screen)\b[^}]*}\s*from\s*"@testing-library/
    const files = git("ls-files", "*.test.ts")
    expect(files.filter((file) => rendering.test(readFileSync(file, "utf8")))).toEqual([])
  })
})
