import { describe, expect, it } from "vite-plus/test"
import { ROUND_GRACE, type Game } from "../game.ts"
import { viewIn } from "../view-in.ts"
import { QuestionType } from "../../questions.ts"
import { SEAT_GRACE, mixOf } from "../../protocol/config.ts"
import { Phase } from "../../protocol/views.ts"
import { playerName, type PlayerToken } from "../../ids.ts"
import { HintAxis } from "../../hints.ts"
import { CloseReason } from "../../close-reason.ts"
import type { Seat } from "../seats.ts"
import { T0, viewOf, tokA, tokB, tokZ, paintOn, makeGame, twoPlayerGame, currentQuestion } from "./support.ts"

describe("play again", () => {
  it("play again returns to the lobby with scores reset", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    game.next(tokA, T0 + 80_000)
    expect(game.phase).toBe(Phase.RESULTS)
    expect(game.join(tokZ, playerName("Zed"), T0 + 80_001)).toEqual({ ok: false, reason: CloseReason.FINISHED })
    expect(game.again(tokA, T0 + 81_000).ok).toBe(true)
    expect(game.phase).toBe(Phase.LOBBY)
    expect(viewOf(game, tokA, T0 + 81_000).players.map((player) => player.score)).toEqual([0, 0])
  })

  it("play again keeps a player who is away their seat for the lobby's grace, from then", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    game.disconnect(tokB, T0 + 1)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    game.next(tokA, T0 + 80_000)
    const again = T0 + 81_000
    game.again(tokA, again)
    game.tick(again + SEAT_GRACE - 1)
    game.join(tokB, playerName("Bob"), again + SEAT_GRACE - 1)
    expect(viewOf(game, tokB, again + SEAT_GRACE).you.id).toBe("p2")

    game.disconnect(tokB, again + SEAT_GRACE)
    game.tick(again + 2 * SEAT_GRACE)
    expect(game.playerTokens).toEqual([tokA])
  })

  it("play again keeps an absent host the host, with the presser acting for them", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    game.disconnect(tokA, T0 + 1)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    game.next(tokB, T0 + 80_000)
    game.again(tokB, T0 + 81_000)
    game.join(tokA, playerName("Alice"), T0 + 82_000)
    expect(viewOf(game, tokA, T0 + 82_000).you.isHost).toBe(true)
  })

  it("play again leaves each player as a new joiner would be, but for who they are", () => {
    const record = (game: Game, token: PlayerToken) =>
      (game as unknown as { seats: { get(token: PlayerToken): Seat } }).seats.get(token).role
    const fresh = twoPlayerGame(1)
    const game = makeGame({ config: { mix: mixOf({ [QuestionType.PLACE]: 1 }), roundLength: 60_000, hints: 1 } })
    game.join(tokA, playerName("Alice"), T0)
    game.join(tokB, playerName("Bob"), T0 + 1)
    game.start(tokA, T0)
    game.hint(tokA, HintAxis.LATITUDE)
    game.setPaint(tokA, paintOn(currentQuestion(game, tokA, T0)))
    game.tick(T0 + 60_000 + ROUND_GRACE)
    game.next(tokA, T0 + 80_000)
    game.again(tokA, T0 + 81_000)
    expect(record(game, tokA)).toEqual(record(fresh, tokA))
    expect(record(game, tokB)).toEqual(record(fresh, tokB))
  })

  it("play again starts the next game's first round with no lock, hint or paint left over", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    game.setPaint(tokA, paintOn(currentQuestion(game, tokA, T0)))
    game.hint(tokA, HintAxis.LATITUDE)
    game.lock(tokA, T0 + 1_000)
    game.end(tokA)
    game.again(tokA, T0 + 5_000)
    game.start(tokA, T0 + 6_000)
    const { you } = viewIn(viewOf(game, tokA, T0 + 6_000), Phase.GUESSING)
    expect(you.role).toMatchObject({ locked: false })
    expect(you).not.toHaveProperty("hint")
    expect(you).not.toHaveProperty("paint")
  })
})
