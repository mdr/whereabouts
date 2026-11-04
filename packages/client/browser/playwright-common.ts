// What the iwft and e2e Playwright configs share.
import { createServer, type Server } from "node:net"
import type { PlaywrightTestConfig } from "@playwright/test"
import { CHROME } from "./tests/support.ts"

type WebServer = NonNullable<Exclude<PlaywrightTestConfig["webServer"], unknown[]>>

/** Settings for a run whose output goes to smoke-out/<name>/ and its report to smoke-out/<name>-report/. */
export const runSettings = (name: string, clientPort: string): PlaywrightTestConfig => ({
  testDir: "tests",
  outputDir: `../../../smoke-out/${name}`,
  timeout: 5 * 60_000,
  workers: 3,
  reporter: [["list"], ["html", { outputFolder: `../../../smoke-out/${name}-report`, open: "never" }]],
  use: { ...CHROME, baseURL: `http://localhost:${clientPort}` }
})

/** A dev server of the run's own, never one already running. */
export const devServer = (workspace: string, url: string, env: Record<string, string>): WebServer => ({
  command: `pnpm --filter ./packages/${workspace} dev`,
  cwd: "../../..",
  env: { WARM_VR: "1", ...env },
  url,
  reuseExistingServer: false
})

const openProbe = (): Promise<{ probe: Server; port: number }> =>
  new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address()
      if (typeof address === "object" && address) resolve({ probe, port: address.port })
      else reject(new Error("no port"))
    })
  })

/**
 * The ports in these variables, picking free ones for those unset, so runs
 * in other worktrees never collide. Picked while all are held, so no two are
 * the same, and written back to the environment: Playwright's workers load
 * the config again and inherit them, so the whole run agrees.
 */
export const portsIn = async <V extends string>(...variables: V[]): Promise<Record<V, string>> => {
  const unset = variables.filter((variable) => process.env[variable] === undefined)
  const probes = await Promise.all(unset.map(() => openProbe()))
  unset.forEach((variable, i) => (process.env[variable] = String(probes[i]!.port)))
  await Promise.all(probes.map(({ probe }) => new Promise((resolve) => probe.close(resolve))))
  return Object.fromEntries(variables.map((variable) => [variable, process.env[variable]!])) as Record<V, string>
}
