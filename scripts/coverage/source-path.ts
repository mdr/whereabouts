import { posix } from "node:path"

const inPackage = /(?:^|\/)(packages\/(?:client|server|shared)\/.*)$/
const devServer = /^(?:localhost|127\.0\.0\.1)(?:-\d+)?\/(.*)$/

/**
 * Where a script ran from, from the repository's root, given its path as the
 * report records it: a module of the client's dev server (host-port/path,
 * /@fs/ for files outside the client), or a file already from the root.
 */
const scriptPath = (distFile: string, repo: string): string => {
  const served = devServer.exec(distFile)?.[1]
  if (served === undefined) return distFile
  if (served.startsWith("@fs/")) return posix.relative(repo, `/${served.slice("@fs/".length)}`)
  return posix.join("packages/client", served)
}

/**
 * A source's path from the repository's root, however it was recorded: the
 * unit tests give one already, while the browser's and Playwright's source
 * maps name only the file, beside the script they ran (`distFile`).
 */
export const repoSourcePath = (sourcePath: string, distFile: string | undefined, repo: string): string => {
  const known = inPackage.exec(sourcePath)
  if (known) return known[1]!
  if (!distFile) return sourcePath
  return posix.join(posix.dirname(scriptPath(distFile, repo)), sourcePath)
}

const excluded = [/\.test\.tsx?$/, /\.iwbt\.ts$/, /\.d\.ts$/, /\/test-support\//, /\/vendor\//, /\/test-setup\.ts$/]

/** The application's own source, where coverage is measured: not tests, test support or vendored code. */
export const isMeasured = (path: string): boolean =>
  /^packages\/(client|server|shared)\/src\/.*\.tsx?$/.test(path) && !excluded.some((pattern) => pattern.test(path))
