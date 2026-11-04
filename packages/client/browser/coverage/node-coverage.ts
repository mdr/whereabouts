import { Session } from "node:inspector/promises"
import { CoverageReport } from "monocart-coverage-reports"
import { COVERAGE, iwftCoverageOptions } from "./coverage-options.ts"

const packageSource = /\/packages\/(server|shared)\/src\//

let session: Session | undefined

/**
 * Records the server and shared code this worker runs (the in-process game
 * server). Started from the config, which a worker loads before any test
 * file, so modules' top levels count too.
 */
export const startNodeCoverage = async (): Promise<void> => {
  if (!COVERAGE || session || process.env["TEST_WORKER_INDEX"] === undefined) return
  session = new Session()
  session.connect()
  // The debugger keeps each script's source, which is Playwright's transform of the .ts, not the file on disk.
  await session.post("Debugger.enable")
  await session.post("Profiler.enable")
  await session.post("Profiler.startPreciseCoverage", { callCount: true, detailed: true })
}

/** Adds what this worker ran to the run's coverage. */
export const saveNodeCoverage = async (): Promise<void> => {
  if (!session) return
  const { result } = await session.post("Profiler.takePreciseCoverage")
  const scripts = result.filter(({ url }) => packageSource.test(url) && !url.includes("/node_modules/"))
  const entries = await Promise.all(
    scripts.map(async (script) => {
      const { scriptSource } = await session!.post("Debugger.getScriptSource", { scriptId: script.scriptId })
      return { ...script, source: scriptSource }
    })
  )
  if (entries.length > 0) await new CoverageReport(iwftCoverageOptions).add(entries)
}
