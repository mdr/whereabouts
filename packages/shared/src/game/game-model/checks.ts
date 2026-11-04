/** What must hold after every step: the game agrees with the model, through what players see, and a few rules besides. */
import { expect } from "vite-plus/test"
import type { PlayerToken } from "../../ids.ts"
import { MAX_PLAYERS, MAX_SPECTATORS } from "../../protocol/config.ts"
import { Phase, type GameView } from "../../protocol/views.ts"
import { Role, YouRoleType, everyone } from "../../roles.ts"
import { TOKENS, type Real } from "./actions.ts"
import type { GameModel, ModelSeat } from "./model.ts"

/** Every token's view, as text, leaving out the clock and your own paint (which only you sent). */
export const allViews = (real: Real): string[] =>
  TOKENS.map((token) => {
    const view = real.game.view(token, real.now)
    if (!view) return "none"
    const { serverTime: _time, ...rest } = view
    if (rest.phase === Phase.GUESSING) {
      const { paint: _paint, ...you } = rest.you
      return JSON.stringify({ ...rest, you })
    }
    return JSON.stringify(rest)
  })

const expectedRole = (model: GameModel, seat: ModelSeat): YouRoleType => {
  if (seat.role === Role.SPECTATOR) return YouRoleType.SPECTATOR
  const inPlay = model.phase === Phase.GUESSING || model.phase === Phase.REVEAL
  return inPlay && !model.playsRound(seat) ? YouRoleType.JOINED_LATE : YouRoleType.PLAYING
}

/** Each token sees what the model says: seated or not, the phase, the round, who hosts, who is in and done. */
export const expectSameAsModel = (model: GameModel, real: Real): void => {
  const actingHost = model.actingHost()
  for (const token of TOKENS) {
    const seat = model.seat(token)
    const view = real.game.view(token, real.now)
    if (!seat) {
      expect(view, `${token} has no seat`).toBeUndefined()
      continue
    }
    expect(view, `${token} has a seat`).toBeDefined()
    const v = view!
    expect(v.phase).toBe(model.phase)
    expect(v.you.name).toBe(seat.name)
    expect(v.you.isHost, `${token} hosts`).toBe(actingHost === token)
    expect(v.you.role.type, `${token}'s role`).toBe(expectedRole(model, seat))
    if (v.phase === Phase.GUESSING) expect(v.round.index).toBe(model.round)
    if ((v.phase === Phase.GUESSING || v.phase === Phase.REVEAL) && v.you.role.type === YouRoleType.PLAYING) {
      expect(v.you.role.locked, `${token} locked`).toBe(model.lockedIn.has(token))
      if (v.phase === Phase.GUESSING && model.hints !== undefined)
        expect(v.you.role.hintsLeft, `${token}'s hints`).toBe(Math.max(0, model.hints - seat.hintsUsed))
    }
    expectRoster(model, v)
  }
}

const expectRoster = (model: GameModel, view: GameView): void => {
  const shown = everyone(view)
    .map((p) => `${p.name}:${p.type}:${p.connected ? "on" : "off"}`)
    .sort()
  const modelled = model.seats.map((s) => `${s.name}:${s.role}:${s.connected ? "on" : "off"}`).sort()
  expect(shown, "who is in the game").toEqual(modelled)
  if (view.phase === Phase.REVEAL) {
    const readyNames = view.reveal.ready.map((id) => everyone(view).find((p) => p.id === id)?.name).sort()
    const modelReady = [...model.readied].map((token) => model.seat(token)?.name).sort()
    expect(readyNames, "who is ready").toEqual(modelReady)
  }
}

/** Rules the model doesn't predict: totals are numbers, colours unique, capacity kept, one host while anyone is here. */
export const expectInvariants = (real: Real): void => {
  const views = TOKENS.flatMap((token) => real.game.view(token, real.now) ?? [])
  for (const view of views) {
    for (const player of view.players) expect(Number.isFinite(player.score), `${player.name}'s total`).toBe(true)
    if (view.phase === Phase.RESULTS)
      for (const standing of view.results)
        expect(Number.isFinite(standing.total), `${standing.name}'s final`).toBe(true)
    const colours = view.players.map((player) => player.colour)
    expect(new Set(colours).size, "colours are unique").toBe(colours.length)
    expect(view.players.length).toBeLessThanOrEqual(MAX_PLAYERS)
    expect(view.spectators.length).toBeLessThanOrEqual(MAX_SPECTATORS)
    const here = everyone(view).filter((p) => p.connected)
    if (here.length > 0) {
      const hosts = everyone(view).filter((p) => p.isHost)
      expect(hosts.length, "one host").toBe(1)
      expect(hosts[0]!.connected, "the host is here").toBe(true)
    }
  }
}

/**
 * A reveal's results and the final results are a record: once shown they don't change
 * while they're on show, whoever renames, leaves or is removed. Keyed by game and round.
 */
export const expectRecordsKept = (model: GameModel, real: Real, records: Map<string, string>): void => {
  const view = TOKENS.map((token: PlayerToken) => real.game.view(token, real.now)).find((v) => v !== undefined)
  if (!view) return
  let key: string | undefined
  let record: unknown
  if (view.phase === Phase.REVEAL) {
    key = `${model.game}:reveal:${model.round}`
    const { ready: _ready, ...rest } = view.reveal
    record = rest
  } else if (view.phase === Phase.RESULTS) {
    key = `${model.game}:results`
    record = { results: view.results, playedRounds: view.playedRounds, awards: view.awards }
  }
  if (key === undefined) return
  const text = JSON.stringify(record)
  const before = records.get(key)
  if (before === undefined) records.set(key, text)
  else expect(text, `the ${key} record`).toBe(before)
}
