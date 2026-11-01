import { describe, expect, it } from "vite-plus/test"
import { ROUND_GRACE, type Game } from "../game.ts"
import { viewIn } from "../view-in.ts"
import { MAX_PLAYERS } from "../../protocol/config.ts"
import { Phase } from "../../protocol/views.ts"
import { playerName, roomCode } from "../../ids.ts"
import { Role, YouRoleType, everyone } from "../../roles.ts"
import {
  T0,
  tok,
  viewOf,
  tokA,
  tokB,
  tokH,
  tokS,
  tokW,
  paintAt,
  makeGame,
  twoPlayerGame,
  currentQuestion
} from "./support.ts"

describe("spectators", () => {
  const T1 = T0 + 60_000
  const withSpectator = (): Game => {
    const game = twoPlayerGame(2)
    expect(game.join(tokS, playerName("Sam"), T0 + 2, Role.SPECTATOR).ok).toBe(true)
    return game
  }
  const sam = (game: Game) => everyone(viewOf(game, tokA, T0)).find((player) => player.name === "Sam")!

  it("joins to watch when asked, listed apart from the players, with no colour, score or rank", () => {
    const game = withSpectator()
    const view = viewOf(game, tokS, T0)
    expect(view.you.role).toEqual({ type: YouRoleType.SPECTATOR })
    expect(view.players.map((player) => player.name)).toEqual(["Alice", "Bob"])
    expect(view.spectators).toEqual([
      { id: sam(game).id, name: "Sam", type: Role.SPECTATOR, connected: true, isHost: false }
    ])
  })

  describe("in a game with players", () => {
    const inRound = () => {
      const game = withSpectator()
      game.start(tokA, T0)
      return { game, question: currentQuestion(game, tokA, T0) }
    }
    const atReveal = () => {
      const { game } = inRound()
      game.lock(tokA, T0 + 1)
      game.lock(tokB, T0 + 2)
      return game
    }

    it("cannot paint", () => {
      const { game, question } = inRound()
      expect(game.setPaint(tokS, paintAt(question, 0, 0))).toEqual({ ok: false, error: "you are watching" })
    })

    it("cannot lock in", () => {
      const { game } = inRound()
      expect(game.lock(tokS, T0)).toEqual({ ok: false, error: "you are watching" })
    })

    it("is not waited on: the round ends when the players have locked in, and scores only them", () => {
      const game = atReveal()
      expect(game.phase).toBe(Phase.REVEAL)
      const reveal = viewIn(viewOf(game, tokS, T0 + 2), Phase.REVEAL).reveal
      expect(reveal.results.map((result) => result.playerId).sort()).toEqual(["p1", "p2"])
    })

    it("cannot ready up", () => {
      const game = atReveal()
      expect(game.ready(tokS, T0 + 3)).toEqual({ ok: false, error: "you are watching" })
    })

    it("is not waited on at the reveal: it moves on when the players are ready", () => {
      const game = atReveal()
      game.ready(tokA, T0 + 3)
      game.ready(tokB, T0 + 4)
      expect(game.phase).toBe(Phase.GUESSING)
    })

    it("is left out of the final results", () => {
      const game = atReveal()
      game.ready(tokA, T0 + 3)
      game.ready(tokB, T0 + 4)
      game.tick(T1 + 10_000 + ROUND_GRACE)
      game.next(tokA, T1 + 10_000)
      expect(
        viewIn(viewOf(game, tokS, T1 + 10_000), Phase.RESULTS)
          .results.map((result) => result.playerId)
          .sort()
      ).toEqual(["p1", "p2"])
    })
  })

  it("switches role in the lobby only, taking or giving up a colour", () => {
    const game = withSpectator()
    expect(game.setRole(tokS, Role.PLAYER)).toEqual({ ok: true, changed: true })
    expect(sam(game)).toMatchObject({ type: Role.PLAYER, colour: 2 })
    expect(game.setRole(tokB, Role.SPECTATOR)).toEqual({ ok: true, changed: true })
    expect(viewOf(game, tokB, T0).spectators.map((player) => player.name)).toEqual(["Bob"])
    expect(game.setRole(tokB, Role.SPECTATOR)).toEqual({ ok: true, changed: false })
    game.start(tokA, T0)
    expect(game.setRole(tokA, Role.SPECTATOR)).toEqual({
      ok: false,
      error: "you can only switch to watching in the lobby"
    })
  })

  it("a spectator can take a free seat mid-round, sitting that round out and playing from the next", () => {
    const game = withSpectator()
    game.start(tokA, T0)
    expect(game.setRole(tokS, Role.PLAYER)).toEqual({ ok: true, changed: true })
    const view = viewOf(game, tokS, T0 + 1)
    expect(view.you.role).toMatchObject({ type: YouRoleType.JOINED_LATE })
    expect(viewOf(game, tokA, T0 + 1).players.find((player) => player.name === "Sam")!.colour).toBeGreaterThanOrEqual(0)
    expect(game.lock(tokS, T0 + 1)).toEqual({ ok: false, error: "sitting this round out" })
    // Alice and Bob finishing still ends the round without Sam.
    game.lock(tokA, T0 + 2)
    game.lock(tokB, T0 + 3)
    expect(game.phase).toBe(Phase.REVEAL)
    // Sam is a player now, so the reveal waits for his Ready too.
    game.ready(tokA, T0 + 4)
    game.ready(tokB, T0 + 5)
    expect(game.phase).toBe(Phase.REVEAL)
    game.ready(tokS, T0 + 6)
    expect(game.phase).toBe(Phase.GUESSING)
    expect(viewOf(game, tokS, T0 + 6).you.role.type).toBe(YouRoleType.PLAYING)
    game.tick(T0 + 6 + 60_000 + ROUND_GRACE)
    game.next(tokA, T0 + 6 + 60_000)
    const standing = viewIn(viewOf(game, tokS, T0 + 6 + 60_000), Phase.RESULTS).results.find(
      (result) => result.playerId === sam(game).id
    )!
    expect(standing.rounds).toEqual([{}, { score: 250 }])
  })

  it("taking a seat at the reveal means playing from the next round", () => {
    const game = withSpectator()
    game.start(tokA, T0)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    expect(game.phase).toBe(Phase.REVEAL)
    game.setRole(tokS, Role.PLAYER)
    game.ready(tokA, T0 + 60_001)
    game.ready(tokB, T0 + 60_002)
    game.ready(tokS, T0 + 60_003)
    expect(viewOf(game, tokS, T0 + 60_003).you.role.type).toBe(YouRoleType.PLAYING)
  })

  it("nobody switches on the final results", () => {
    const game = withSpectator()
    game.start(tokA, T0)
    game.end(tokA)
    expect(game.setRole(tokS, Role.PLAYER)).toEqual({ ok: false, error: "game has finished" })
  })

  it("cannot take a seat when all the player seats are taken", () => {
    const game = twoPlayerGame(2)
    for (let i = 3; i <= MAX_PLAYERS; i++) game.join(tok(`${i}`), playerName(`P${i}`), T0)
    game.join(tokS, playerName("Sam"), T0, Role.SPECTATOR)
    expect(game.setRole(tokS, Role.PLAYER)).toEqual({ ok: false, error: "game is full" })
    expect(game.join(tokW, playerName("Wes"), T0, Role.SPECTATOR).ok).toBe(true)
  })

  it("a host can watch and still run the game, but a game needs a player to start", () => {
    const game = twoPlayerGame(1)
    game.setRole(tokA, Role.SPECTATOR)
    expect(viewOf(game, tokA, T0).you.isHost).toBe(true)
    expect(game.start(tokA, T0).ok).toBe(true)
    const otherGame = makeGame({ code: roomCode("WXYZ") })
    otherGame.join(tokH, playerName("Hana"), T0, Role.SPECTATOR)
    expect(otherGame.start(tokH, T0)).toEqual({ ok: false, error: "no players" })
  })

  it("a spectator reclaims their seat as a spectator after a refresh", () => {
    const game = withSpectator()
    game.disconnect(tokS, T0 + 5)
    game.join(tokS, playerName("Sam"), T0 + 6)
    expect(viewOf(game, tokS, T0 + 6).you.role).toEqual({ type: YouRoleType.SPECTATOR })
  })
})
