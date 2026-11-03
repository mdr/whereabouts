import { describe, expect, it } from "vite-plus/test"
import { playerColour } from "@whereabouts/shared/colours"
import { playerId, playerName } from "@whereabouts/shared/ids"
import { MAX_PLAYERS } from "@whereabouts/shared/protocol/config"
import type { GameView } from "@whereabouts/shared/protocol/views"
import { makeLobbyView, makePlayer } from "../../test-view"
import { canTakeSeat, seatsTakenTitle } from "./seat-rules"

const viewWith = (count: number): GameView =>
  makeLobbyView({
    players: Array.from({ length: count }, (_, i) =>
      makePlayer({ id: playerId(`p${i + 1}`), name: playerName(`P${i}`), colour: playerColour(i) })
    )
  })

describe("taking a seat", () => {
  it("is on while a seat is free and the connection is up", () => {
    expect(canTakeSeat(viewWith(MAX_PLAYERS - 1), true)).toBe(true)
    expect(seatsTakenTitle(viewWith(MAX_PLAYERS - 1))).toBeUndefined()
  })

  it("is off while every seat is taken, saying so", () => {
    expect(canTakeSeat(viewWith(MAX_PLAYERS), true)).toBe(false)
    expect(seatsTakenTitle(viewWith(MAX_PLAYERS))).toBe(`All ${MAX_PLAYERS} player seats are taken`)
  })

  it("is off while reconnecting, when asking would be lost", () => {
    expect(canTakeSeat(viewWith(3), false)).toBe(false)
  })
})
