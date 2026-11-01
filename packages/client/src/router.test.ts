// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test"
import { roomCode } from "@whereabouts/shared/ids"
import { GameEntryType, type GameEntry } from "@whereabouts/shared/protocol"
import { Role } from "@whereabouts/shared/roles"
import { navigate, parseRoute, route, RouteType } from "./router"

const gameAt = (entry: GameEntry) => ({ type: RouteType.GAME, entry })
const join = (code: string): GameEntry => ({ type: GameEntryType.JOIN, code: roomCode(code), role: Role.PLAYER })
const host = (code?: string): GameEntry => ({ type: GameEntryType.HOST, ...(code ? { code: roomCode(code) } : {}) })

describe("parseRoute", () => {
  it("parses game codes case-insensitively and rejects bad ones", () => {
    expect(parseRoute("#/game/ab12")).toEqual(gameAt(join("AB12")))
    expect(parseRoute("#/game/ABCDEF")).toEqual(gameAt(join("ABCDEF")))
    expect(parseRoute("#/game/toolongcode")).toEqual({ type: RouteType.HOME })
    expect(parseRoute("#/game/ab")).toEqual({ type: RouteType.HOME })
  })

  it("recognises solo, new-game and home", () => {
    expect(parseRoute("#/solo")).toEqual({ type: RouteType.SOLO })
    expect(parseRoute("#/score-review")).toEqual({ type: RouteType.SCORE_REVIEW })
    expect(parseRoute("#/game/new")).toEqual(gameAt(host()))
    expect(parseRoute("#/game/new/vwzr")).toEqual(gameAt(host("VWZR")))
    expect(parseRoute("")).toEqual({ type: RouteType.HOME })
    expect(parseRoute("#/nowhere")).toEqual({ type: RouteType.HOME })
  })

  it("ignores a query string after the path", () => {
    expect(parseRoute("#/solo?dev")).toEqual({ type: RouteType.SOLO })
    expect(parseRoute("#/game/ab12?dev")).toEqual(gameAt(join("AB12")))
  })
})

describe("navigate", () => {
  it("updates the route synchronously and the hash", () => {
    navigate("/solo")
    expect(route.value).toEqual({ type: RouteType.SOLO })
    expect(location.hash).toBe("#/solo")
    navigate("/game/ZZ99")
    expect(route.value).toEqual(gameAt(join("ZZ99")))
  })

  it.each(["/", "/solo", "/score-review", "/game/new", "/game/new/VWZR", "/game/AB12"])(
    "leaves the URL %s as it is",
    (url) => {
      navigate(url)
      expect(location.hash).toBe(`#${url}`)
      expect(route.value).toEqual(parseRoute(`#${url}`))
    }
  )
})
