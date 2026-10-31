import { describe, expect, it } from "vite-plus/test"
import { lockfileFingerprint, readPnpmDeps } from "./pnpm-deps.ts"

describe("the flake's pnpm dependency hash", () => {
  it("was taken from the current lockfile (run `task nix:hash` if not)", () => {
    expect(readPnpmDeps().lockfile).toBe(lockfileFingerprint())
  })
})
