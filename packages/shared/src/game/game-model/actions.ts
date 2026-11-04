/** What players and the clock can do to a game, generated at random, and applied to it and the model alike. */
import fc from "fast-check"
import { HintAxis } from "../../hints.ts"
import { playerName, type PlayerToken } from "../../ids.ts"
import { Role } from "../../roles.ts"
import type { Ms } from "../../units.ts"
import type { Game } from "../game.ts"
import { paintOn, petra, tok } from "../game-tests/support.ts"
import type { Expected, GameModel } from "./model.ts"

/** Few enough that the same people keep coming back. */
export const TOKENS: readonly PlayerToken[] = ["A", "B", "C", "D", "E"].map(tok)

export enum ActionType {
  JOIN = "JOIN",
  DISCONNECT = "DISCONNECT",
  LEAVE = "LEAVE",
  START = "START",
  NEXT = "NEXT",
  AGAIN = "AGAIN",
  SET_ROLE = "SET_ROLE",
  MAKE_HOST = "MAKE_HOST",
  KICK = "KICK",
  END = "END",
  RENAME = "RENAME",
  HINT = "HINT",
  PAINT = "PAINT",
  LOCK = "LOCK",
  UNLOCK = "UNLOCK",
  READY = "READY",
  WAIT = "WAIT"
}

export type Action =
  | { type: ActionType.JOIN; who: number; role: Role }
  | { type: ActionType.SET_ROLE; who: number; role: Role }
  | { type: ActionType.MAKE_HOST | ActionType.KICK; who: number; target: number }
  | {
      type:
        | ActionType.DISCONNECT
        | ActionType.LEAVE
        | ActionType.START
        | ActionType.NEXT
        | ActionType.AGAIN
        | ActionType.END
        | ActionType.RENAME
        | ActionType.HINT
        | ActionType.PAINT
        | ActionType.LOCK
        | ActionType.UNLOCK
        | ActionType.READY
      who: number
    }
  | { type: ActionType.WAIT; ms: Ms }

/** The acting host, as a choice of who acts. */
const HOST = -1

/** Mostly the host or someone seated, so games get going; sometimes anyone at all. */
const who = fc.oneof(
  { arbitrary: fc.constant(HOST), weight: 2 },
  { arbitrary: fc.nat({ max: TOKENS.length - 1 }), weight: 3 }
)
const anyone = fc.nat({ max: TOKENS.length - 1 })
const role = fc.constantFrom(Role.PLAYER, Role.SPECTATOR)
const simple = (
  type: Exclude<Action, { who: number; role: Role } | { target: number } | { ms: Ms }>["type"]
): fc.Arbitrary<Action> => who.map((index): Action => ({ type, who: index }))

/** Weighted so games get going and get played, not just joined and left. */
export const anAction: fc.Arbitrary<Action> = fc.oneof(
  { arbitrary: fc.record({ type: fc.constant(ActionType.JOIN), who: anyone, role }), weight: 6 },
  { arbitrary: simple(ActionType.DISCONNECT), weight: 2 },
  { arbitrary: simple(ActionType.LEAVE), weight: 1 },
  { arbitrary: simple(ActionType.START), weight: 3 },
  { arbitrary: simple(ActionType.NEXT), weight: 1 },
  { arbitrary: simple(ActionType.AGAIN), weight: 2 },
  { arbitrary: fc.record({ type: fc.constant(ActionType.SET_ROLE), who, role }), weight: 1 },
  { arbitrary: fc.record({ type: fc.constant(ActionType.MAKE_HOST), who, target: anyone }), weight: 1 },
  { arbitrary: fc.record({ type: fc.constant(ActionType.KICK), who, target: anyone }), weight: 1 },
  { arbitrary: simple(ActionType.END), weight: 1 },
  { arbitrary: simple(ActionType.RENAME), weight: 1 },
  { arbitrary: simple(ActionType.HINT), weight: 1 },
  { arbitrary: simple(ActionType.PAINT), weight: 2 },
  { arbitrary: simple(ActionType.LOCK), weight: 5 },
  { arbitrary: simple(ActionType.UNLOCK), weight: 1 },
  { arbitrary: simple(ActionType.READY), weight: 5 },
  {
    arbitrary: fc.record({
      type: fc.constant(ActionType.WAIT),
      ms: fc.constantFrom<Ms>(1_000, 20_000, 31_000, 62_000)
    }),
    weight: 2
  }
)

export const describeAction = (action: Action): string => {
  switch (action.type) {
    case ActionType.WAIT:
      return `wait(${action.ms})`
    case ActionType.JOIN:
    case ActionType.SET_ROLE:
      return `${action.type.toLowerCase()}(${action.who}, ${action.role})`
    case ActionType.MAKE_HOST:
    case ActionType.KICK:
      return `${action.type.toLowerCase()}(${action.who} -> ${action.target})`
    case ActionType.DISCONNECT:
    case ActionType.LEAVE:
    case ActionType.START:
    case ActionType.NEXT:
    case ActionType.AGAIN:
    case ActionType.END:
    case ActionType.RENAME:
    case ActionType.HINT:
    case ActionType.PAINT:
    case ActionType.LOCK:
    case ActionType.UNLOCK:
    case ActionType.READY:
      return `${action.type.toLowerCase()}(${action.who})`
  }
}

/**
 * Who does it: anyone for a join; otherwise the acting host for HOST, else one of the seated
 * (or anyone, if nobody is seated), so most actions come from people in the game.
 */
export const whoActs = (action: Exclude<Action, { type: ActionType.WAIT }>, model: GameModel): PlayerToken => {
  if (action.type === ActionType.JOIN) return TOKENS[action.who]!
  if (action.who === HOST) return model.actingHost() ?? TOKENS[0]!
  const seated = model.seats.map((seat) => seat.token)
  return seated.length > 0 ? seated[action.who % seated.length]! : TOKENS[action.who]!
}

/** The real game, and the clock the test keeps for it. */
export interface Real {
  game: Game
  now: number
  renames: number
}

const nameOf = (token: PlayerToken): string => `Player ${token.slice(3, 4)}`

/** Does the action to the model and to the game: what the model says should come back, and what did. */
export const apply = (
  action: Action,
  model: GameModel,
  real: Real
): { expected: Expected | boolean; actual: { ok: boolean; changed?: boolean; reason?: string } | boolean } => {
  if (action.type === ActionType.WAIT) {
    real.now += action.ms
    return { expected: model.tick(real.now), actual: real.game.tick(real.now) }
  }
  real.now += 1
  const { game, now } = real
  const token = whoActs(action, model)
  switch (action.type) {
    case ActionType.JOIN:
      return {
        expected: model.join(token, nameOf(token), action.role),
        actual: game.join(token, playerName(nameOf(token)), now, action.role)
      }
    case ActionType.DISCONNECT:
      return { expected: model.disconnect(token, now), actual: game.disconnect(token, now) }
    case ActionType.LEAVE:
      return { expected: model.leave(token), actual: game.leave(token) }
    case ActionType.START:
      return { expected: model.start(token, now), actual: game.start(token, now) }
    case ActionType.NEXT:
      return { expected: model.next(token, now), actual: game.next(token, now) }
    case ActionType.AGAIN:
      return { expected: model.again(token, now), actual: game.again(token, now) }
    case ActionType.SET_ROLE:
      return { expected: model.setRole(token, action.role), actual: game.setRole(token, action.role) }
    case ActionType.MAKE_HOST: {
      const target = TOKENS[action.target]!
      const id = game.identify(target)?.id
      if (id === undefined) return { expected: { ok: false }, actual: { ok: false } }
      return { expected: model.makeHost(token, target), actual: game.makeHost(token, id) }
    }
    case ActionType.KICK: {
      const target = TOKENS[action.target]!
      const id = game.identify(target)?.id
      if (id === undefined) return { expected: { ok: false }, actual: { ok: false } }
      return { expected: model.kick(token, target, now), actual: game.kick(token, id, now) }
    }
    case ActionType.END:
      return { expected: model.end(token), actual: game.end(token) }
    case ActionType.RENAME: {
      const name = `${nameOf(token)} ${++real.renames}`
      return { expected: model.rename(token, name), actual: game.rename(token, playerName(name)) }
    }
    case ActionType.HINT:
      return { expected: model.hint(token), actual: game.hint(token, HintAxis.LATITUDE) }
    case ActionType.PAINT:
      return { expected: model.paint(token), actual: game.setPaint(token, paintOn(petra)) }
    case ActionType.LOCK:
      return { expected: model.lock(token, now), actual: game.lock(token, now) }
    case ActionType.UNLOCK:
      return { expected: model.unlock(token), actual: game.unlock(token) }
    case ActionType.READY:
      return { expected: model.ready(token, now), actual: game.ready(token, now) }
  }
}
