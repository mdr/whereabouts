/**
 * Tiny hash router: "#/", "#/solo", "#/game/CODE", "#/game/new", and
 * "#/game/new/CODE" to host a game under a code no game has now; and
 * "#/score-review", linked from nowhere, for playtesters. A query string
 * after the path ("#/solo?dev") is ignored here; see dev.ts.
 */
import { batch, signal } from "@preact/signals"
import { roomCode, type RoomCode } from "@whereabouts/shared/ids"

export type Route =
  | { name: "home" }
  | { name: "solo" }
  | { name: "score-review" }
  | { name: "game"; code: RoomCode | undefined; create: true }
  | { name: "game"; code: RoomCode; create: false }

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "").replace(/\?.*$/, "")
  if (path === "/solo") return { name: "solo" }
  if (path === "/score-review") return { name: "score-review" }
  if (path === "/game/new") return { name: "game", code: undefined, create: true }
  const again = /^\/game\/new\/([A-Z0-9]{4,6})$/i.exec(path)
  if (again) return { name: "game", code: roomCode(again[1]!.toUpperCase()), create: true }
  const m = /^\/game\/([A-Z0-9]{4,6})$/i.exec(path)
  if (m) return { name: "game", code: roomCode(m[1]!.toUpperCase()), create: false }
  return { name: "home" }
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
