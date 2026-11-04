import { posix } from "node:path"

/** One import, by repo-relative paths. */
export interface Import {
  from: string
  to: string
  typeOnly: boolean
  dynamic: boolean
}

const PACKAGE_NAME = /^@whereabouts\/(client|server|shared)(\/.*)?$/

/** The repo-relative path an import names, or undefined for an outside package's. */
export const importedPath = (from: string, specifier: string): string | undefined => {
  if (specifier.startsWith(".")) return posix.join(posix.dirname(from), specifier)
  const named = PACKAGE_NAME.exec(specifier)
  return named ? `packages/${named[1]}${named[2] ?? ""}` : undefined
}

const withoutExtension = (path: string): string => path.replace(/\.tsx?$/, "")

const packageOf = (path: string): string | undefined => /^packages\/([^/]+)\//.exec(path)?.[1]

const IN_PROCESS_SERVER = "packages/server/src/test-support/in-process-server"

/** Why an import crosses between the packages where it must not, if it does. */
export const packageProblem = ({ from, to }: Import): string | undefined => {
  const source = packageOf(from)
  const target = packageOf(to)
  if (source === target || target === "shared") return undefined
  if (source === "shared")
    return "shared is used by both the client and the server, so it imports neither: move what it needs into shared."
  if (source === "server") return "The server doesn't import the client: move what both need into shared."
  if (source === "client" && target === "server") {
    if (from.startsWith("packages/client/browser/") && withoutExtension(to) === IN_PROCESS_SERVER) return undefined
    return from.startsWith("packages/client/browser/")
      ? "Browser tests reach the server only through server/src/test-support/in-process-server.ts, which the game fixture starts."
      : "The client doesn't import the server: move what both need into shared."
  }
  return undefined
}

const TEST_CODE = /(\.test\.tsx?|\.iwbt\.ts)$|\/test-support\/|^packages\/client\/browser\//

/** Why an import brings test helpers into code that ships, if it does. */
export const testSupportProblem = ({ from, to }: Import): string | undefined =>
  to.includes("/test-support/") && !TEST_CODE.test(from)
    ? "Only tests use test-support/: move what this needs out of it."
    : undefined

const CLIENT_SOURCE = "packages/client/src/"

/** Folders of client logic, which the UI uses and which use no UI. */
const LOGIC = new Set([
  "data",
  "flags",
  "game-service",
  "keyboard",
  "map",
  "net",
  "paint",
  "round",
  "settings",
  "sound"
])

/** Screen parts that other screens use besides each screen's entry component. */
const SHARED_SCREEN_PARTS = new Set(["screens/solo/PracticeDev/PracticeDev"])

/** A screen's entry component: screens/<name>/<Name>.tsx or screens/<name>/<Name>/<Name>.tsx. */
const isScreenEntry = (path: string): boolean => {
  const [, screen, ...rest] = path.split("/")
  const named = (part: string | undefined): boolean => part?.toLowerCase() === screen?.toLowerCase()
  return rest.length === 1 ? named(rest[0]) : rest.length === 2 && named(rest[0]) && named(rest[1])
}

/** The modules of vr/ that the page uses before or without the VR code, which loads as its own chunk. */
const isVrPageSide = (path: string): boolean =>
  /^vr\/(vr-support|load-stage|picture\/vr-picture|view\/[^/]+)$/.test(path)

const SCREENS_MESSAGE = "Only app.tsx and screens/ show screens: move what this needs into ui/ or a logic folder."
const SCREEN_PART_MESSAGE =
  "Use another screen only through its entry component (screens/<name>/<Name>.tsx or screens/<name>/<Name>/<Name>.tsx): move a part both screens use into ui/."
const LOGIC_MESSAGE =
  "Client logic (data, flags, game-service, keyboard, map, net, paint, round, settings, sound) doesn't import ui/: move what it needs out of ui/."
const VR_MESSAGE =
  "The VR code loads as its own chunk, through loadVr in vr/vr-support.ts: outside it, import it with `import type`, or use vr-support, load-stage, picture/vr-picture or view/."

/** Why an import inside the client's source breaks its layering, if it does. */
export const clientLayerProblem = ({ from, to, typeOnly, dynamic }: Import): string | undefined => {
  if (!from.startsWith(CLIENT_SOURCE) || !to.startsWith(CLIENT_SOURCE)) return undefined
  const source = withoutExtension(from.slice(CLIENT_SOURCE.length))
  const target = withoutExtension(to.slice(CLIENT_SOURCE.length))
  const [sourceFolder, sourceScreen] = source.split("/")
  const [targetFolder, targetScreen] = target.split("/")
  if (targetFolder === "screens") {
    if (sourceFolder !== "screens") return source === "app" ? undefined : SCREENS_MESSAGE
    if (sourceScreen === targetScreen || isScreenEntry(target) || SHARED_SCREEN_PARTS.has(target)) return undefined
    return SCREEN_PART_MESSAGE
  }
  if (targetFolder === "ui" && sourceFolder !== undefined && LOGIC.has(sourceFolder)) return LOGIC_MESSAGE
  const runsInBundle = !typeOnly && !dynamic && !/\.test\.tsx?$/.test(from)
  const outsideVrCode = sourceFolder !== "vr" || isVrPageSide(source)
  if (targetFolder === "vr" && runsInBundle && outsideVrCode && !isVrPageSide(target)) return VR_MESSAGE
  return undefined
}
