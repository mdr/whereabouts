/**
 * Tiny hash router: "#/", "#/solo", "#/game/CODE", "#/game/new", and
 * "#/game/new/CODE" to host a game under a code no game has now; and
 * "#/score-review", linked from nowhere, for playtesters. A query string
 * after the path ("#/solo?dev") is ignored here; see dev.ts.
 */
import { batch, signal } from "@preact/signals"
import { roomCode } from "@whereabouts/shared/ids"
import { GameEntryType, type GameEntry } from "@whereabouts/shared/protocol/ticket"
import { Role } from "@whereabouts/shared/roles"

export enum RouteType {
  HOME = "HOME",
  SOLO = "SOLO",
  SCORE_REVIEW = "SCORE_REVIEW",
  GAME = "GAME"
}

interface HomeRoute {
  type: RouteType.HOME
}
interface SoloRoute {
  type: RouteType.SOLO
}
interface ScoreReviewRoute {
  type: RouteType.SCORE_REVIEW
}
/** A link never asks to watch; that is chosen on the join screen. */
interface GameRoute {
  type: RouteType.GAME
  entry: GameEntry
}
export type Route = HomeRoute | SoloRoute | ScoreReviewRoute | GameRoute

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "").replace(/\?.*$/, "")
  if (path === "/solo") return { type: RouteType.SOLO }
  if (path === "/score-review") return { type: RouteType.SCORE_REVIEW }
  if (path === "/game/new") return { type: RouteType.GAME, entry: { type: GameEntryType.HOST } }
  const again = /^\/game\/new\/([A-Z0-9]{4,6})$/i.exec(path)
  if (again) {
    const code = roomCode(again[1]!.toUpperCase())
    return { type: RouteType.GAME, entry: { type: GameEntryType.HOST, code } }
  }
  const match = /^\/game\/([A-Z0-9]{4,6})$/i.exec(path)
  if (match) {
    const code = roomCode(match[1]!.toUpperCase())
    return { type: RouteType.GAME, entry: { type: GameEntryType.JOIN, code, role: Role.PLAYER } }
  }
  return { type: RouteType.HOME }
}

export const route = signal<Route>(parseRoute(location.hash))

/**
 * Counts navigate calls, so a screen keyed on it starts afresh even when
 * the route is unchanged: Host a new game from a game that began at
 * #/game/new.
 */
export const visit = signal(0)

// Back/forward and hand-edited URLs.
window.addEventListener("hashchange", () => {
  route.value = parseRoute(location.hash)
})

/** Update the URL and the route together, so callers see the change synchronously. */
export function navigate(to: string): void {
  if (location.hash !== `#${to}`) location.hash = to
  batch(() => {
    route.value = parseRoute(to)
    visit.value++
  })
}
