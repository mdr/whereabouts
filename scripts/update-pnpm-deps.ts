// Recomputes the flake's pnpm dependency hash: builds the dependencies with
// no hash, and takes the one Nix reports.
import { spawnSync } from "node:child_process"
import { lockfileFingerprint, readPnpmDeps, writePnpmDeps } from "./pnpm-deps.ts"

const before = readPnpmDeps()
const lockfile = lockfileFingerprint()
writePnpmDeps({ lockfile, hash: "" })
const build = spawnSync("nix", ["build", ".#whereabouts.pnpmDeps", "--no-link"], { encoding: "utf8" })
const hash = /got:\s+(sha256-\S+)/.exec(build.stderr)?.[1]
if (!hash) {
  writePnpmDeps(before)
  process.stderr.write(build.stderr)
  throw new Error("Nix didn't report the dependencies' hash")
}
writePnpmDeps({ lockfile, hash })
process.stdout.write(`pnpm-deps.json: ${hash}\n`)
