import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"

const root = new URL("../", import.meta.url)
const file = new URL("pnpm-deps.json", root)

/** The flake's hash of the pnpm dependencies, and the lockfile it was taken from. */
export interface PnpmDeps {
  lockfile: string
  hash: string
}

export function lockfileFingerprint(): string {
  const hash = createHash("sha256")
  for (const name of ["pnpm-lock.yaml", "pnpm-workspace.yaml"]) hash.update(readFileSync(new URL(name, root)))
  return hash.digest("hex")
}

export function readPnpmDeps(): PnpmDeps {
  return JSON.parse(readFileSync(file, "utf8")) as PnpmDeps
}

export function writePnpmDeps(deps: PnpmDeps): void {
  writeFileSync(file, JSON.stringify(deps, undefined, 2) + "\n")
}
