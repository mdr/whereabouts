/**
 * Rivalis adapter: one GameRoom per game code, each owning a pure Game.
 * This is the only module that knows about Rivalis rooms and actors; the
 * Game itself is I/O free and tested on its own.
 */
import { type Actor, Room, type RoomManager } from "@rivalis/core"
import {
  ClientMessageSchemas,
  type ClientMessages,
  ClientTopic,
  type JsonTopic
} from "@whereabouts/shared/protocol/client-messages"
import { EMPTY_GAME_GRACE, EMPTY_RESULTS_GRACE, SEAT_GRACE, type GameConfig } from "@whereabouts/shared/protocol/config"
import { Phase, type PaintSubmission, type RoundReveal } from "@whereabouts/shared/protocol/views"
import { ServerTopic, encodeMessage, revealMessage, stateMessage } from "@whereabouts/shared/protocol/server-messages"
import { GameEntryType, type GameEntry } from "@whereabouts/shared/protocol/ticket"
import type { CommandResult } from "@whereabouts/shared/game/command-result"
import { Game } from "@whereabouts/shared/game/game"
import type { QuestionBank } from "@whereabouts/shared/game/round-picking"
import { encodePaint } from "@whereabouts/shared/paint/paint-wire"
import { CloseReason } from "@whereabouts/shared/close-reason"
import { Role } from "@whereabouts/shared/roles"
import type { Instant, Ms } from "@whereabouts/shared/units"
import { CATALOGUE, outlinesFrom } from "@whereabouts/shared/catalogue/catalogue"
import { roomCode, type PlayerId, type PlayerName, type PlayerToken } from "@whereabouts/shared/ids"
// The client loads the outlines on demand; the server holds them all, to score.
import outlinesJson from "@whereabouts/shared/outlines.json" with { type: "json" }
import { readJson, readPaint, type Parsed } from "./inbound.ts"
import type { TimeoutHandle } from "@whereabouts/shared/timeout"

/** Close reasons are codes from the shared list, which the client words. */
export const closeReason = (reason: CloseReason): string => reason

/** Tell everyone connected that the server is going away, before Rivalis closes the rooms with its own reason. */
export const kickForRestart = (rooms: RoomManager<ActorData>): void => {
  for (const id of [...rooms.keys()])
    rooms.get(id)?.each((actor) => actor.kick(closeReason(CloseReason.SERVER_RESTARTED)))
}

const emptyGrace = (phase: Phase): Ms => {
  switch (phase) {
    case Phase.LOBBY:
      return SEAT_GRACE
    case Phase.GUESSING:
    case Phase.REVEAL:
      return EMPTY_GAME_GRACE
    case Phase.RESULTS:
      return EMPTY_RESULTS_GRACE
  }
}

export const BANK: QuestionBank = { catalogue: CATALOGUE, outlines: outlinesFrom(outlinesJson) }

export interface ActorData {
  token: PlayerToken
  name: PlayerName
  entry: GameEntry
  /** The client's network address, for the logs. */
  address: string
}

export const ROOM_TYPE = "game"

/** Injected clock so tests can drive time. */
export interface Clock {
  now(): Instant
  setTimeout(callback: () => void, delay: Ms): unknown
  clearTimeout(handle: unknown): void
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (handle) => clearTimeout(handle as TimeoutHandle)
}

export interface GameRoomDeps {
  clock: Clock
  bank: QuestionBank
  config: Partial<GameConfig>
}

/** Set once at startup; rooms are constructed by Rivalis so cannot take arguments. */
let deps: GameRoomDeps = {
  clock: realClock,
  bank: BANK,
  config: {}
}
export const configureGameRooms = (next: Partial<GameRoomDeps>): void => {
  deps = { ...deps, ...next }
}

export class GameRoom extends Room<ActorData> {
  // Not Rivalis's destroyOnEmpty, which closes the room the moment the last
  // player drops: a lone host's refresh would lose the game. An empty room
  // stays open for a while instead (see emptyGrace).
  protected override unknownTopicPolicy = "drop" as const

  // Rivalis runs onCreate from the base constructor, before subclass field
  // initialisers. `declare` fields emit no initialiser, so values assigned in
  // onCreate survive; anything with `= ...` here would be reset afterwards.
  declare private game: Game
  declare private actorsByToken: Map<PlayerToken, Actor<ActorData>>
  declare private timer: unknown
  declare private emptyTimer: unknown
  /** The reveal on show, encoded once, and the connections it has gone to. */
  declare private sentReveal: { reveal: RoundReveal; text: string; to: WeakSet<Actor<ActorData>> } | undefined

  protected override onCreate(): void {
    this.game = new Game(roomCode(this.id), deps.bank, { config: deps.config })
    this.actorsByToken = new Map()
    this.timer = undefined
    this.emptyTimer = undefined
    this.sentReveal = undefined
    const handlers = this.handlers()
    for (const topic of Object.keys(ClientMessageSchemas) as JsonTopic[]) this.bindTopic(topic, handlers)
    this.bind(ClientTopic.PAINT, (actor, payload) =>
      this.handle(actor, ClientTopic.PAINT, readPaint(payload), handlers[ClientTopic.PAINT])
    )
    this.bind(ClientTopic.PING, (actor) => actor.send(ServerTopic.PONG, ""))
  }

  private bindTopic<K extends JsonTopic>(topic: K, handlers: Pick<Commands, K>): void {
    this.bind(topic, (actor, payload) => this.handle(actor, topic, readJson(topic, payload), handlers[topic]))
  }

  private handlers(): Handlers {
    return {
      [ClientTopic.PAINT]: (token, paint) => this.game.setPaint(token, paint),
      [ClientTopic.LOCK]: (token, _, now) => this.game.lock(token, now),
      [ClientTopic.UNLOCK]: (token) => this.game.unlock(token),
      [ClientTopic.READY]: (token, _, now) => this.game.ready(token, now),
      [ClientTopic.CONFIGURE]: (token, patch) => this.game.configure(token, patch),
      [ClientTopic.START]: (token, _, now) => this.game.start(token, now),
      [ClientTopic.NEXT]: (token, _, now) => this.game.next(token, now),
      [ClientTopic.AGAIN]: (token, _, now) => this.game.again(token, now),
      [ClientTopic.RENAME]: (token, { name }) => this.game.rename(token, name),
      [ClientTopic.KICK]: (token, { playerId }, now) => this.removePlayer(token, playerId, now),
      [ClientTopic.SET_ROLE]: (token, { role }) => this.game.setRole(token, role),
      [ClientTopic.LEAVE]: (token) => this.leave(token),
      [ClientTopic.MAKE_HOST]: (token, { playerId }) => this.game.makeHost(token, playerId),
      [ClientTopic.END]: (token) => this.game.end(token),
      [ClientTopic.HINT]: (token, { axis }) => this.game.hint(token, axis)
    }
  }

  protected override onJoin(actor: Actor<ActorData>): void {
    const { token, name, entry, address } = actor.data!
    const role = entry.type === GameEntryType.JOIN ? entry.role : Role.PLAYER
    this.cancelEmptyTimer()
    const previous = this.actorsByToken.get(token)
    if (previous && previous !== actor) previous.kick(closeReason(CloseReason.REPLACED))
    this.actorsByToken.set(token, actor)
    const back = this.game.playerTokens.includes(token)
    const result = this.game.join(token, name, deps.clock.now(), role)
    if (!result.ok) {
      this.logger?.info(`${actor.id} (${name}, ${address}) turned away: ${result.reason}`)
      actor.kick(closeReason(result.reason))
      return
    }
    this.logger?.info(`${actor.id} (${name}, ${address}) ${back ? "rejoined" : "joined"}`)
    const paint = this.game.paintOf(token)
    if (paint) actor.send(ServerTopic.PAINT, encodePaint(paint))
    this.broadcastState()
  }

  protected override onLeave(actor: Actor<ActorData>): void {
    const { token } = actor.data!
    this.logger?.info(`${actor.id} (${actor.data!.name}) left`)
    if (this.actorsByToken.get(token) !== actor) return // superseded by a reconnect
    this.actorsByToken.delete(token)
    this.game.disconnect(token, deps.clock.now())
    this.broadcastState()
    if (this.actorCount === 0) {
      this.cancelEmptyTimer()
      // Everyone left on purpose: nobody is coming back, so close now. (After
      // this leave has finished; Rivalis defers its own teardown the same way.)
      if (this.game.playerCount === 0) {
        queueMicrotask(() => {
          if (this.actorCount === 0) this.destroy()
        })
        return
      }
      this.emptyTimer = deps.clock.setTimeout(() => {
        this.emptyTimer = undefined
        if (this.actorCount === 0) this.destroy()
      }, emptyGrace(this.game.phase))
    }
  }

  protected override onDestroy(): void {
    this.clearTimer()
    this.cancelEmptyTimer()
  }

  private cancelEmptyTimer(): void {
    if (this.emptyTimer !== undefined) deps.clock.clearTimeout(this.emptyTimer)
    this.emptyTimer = undefined
  }

  private handle<T>(actor: Actor<ActorData>, topic: string, parsed: Parsed<T>, handler: Handler<T>): void {
    if (!parsed.ok) {
      this.logger?.warning(`${actor.id} (${actor.data!.name}) sent ${topic}: ${parsed.error}`)
      this.sendError(actor, parsed.error)
      return
    }
    const result = handler(actor.data!.token, parsed.data, deps.clock.now())
    if (!result.ok) {
      this.sendError(actor, result.error)
      return
    }
    if (result.changed) this.broadcastState()
  }

  /** Give up this player's seat and close their connection; the client closes it too. */
  private leave(token: PlayerToken): CommandResult {
    const result = this.game.leave(token)
    if (result.ok) this.actorsByToken.get(token)?.kick(closeReason(CloseReason.LEFT))
    return result
  }

  /** Remove a player from the game and close their connection, telling them why. */
  private removePlayer(token: PlayerToken, playerId: PlayerId, now: Instant): CommandResult {
    const target = this.game.tokenOf(playerId)
    const result = this.game.kick(token, playerId, now)
    if (result.ok && target !== undefined) this.actorsByToken.get(target)?.kick(closeReason(CloseReason.REMOVED))
    return result
  }

  private sendError(actor: Actor<ActorData>, message: string): void {
    actor.send(ServerTopic.ERROR, encodeMessage({ message }))
  }

  /** Views are per player (host flag, lock state), so each is sent on its own. */
  private sendState(actor: Actor<ActorData>, now = deps.clock.now()): void {
    const view = this.game.view(actor.data!.token, now)
    // Removed, left or turned away: the connection is closing and has no seat to show.
    if (!view) return
    const reveal = this.game.roundReveal
    if (reveal) {
      if (this.sentReveal?.reveal !== reveal)
        this.sentReveal = { reveal, text: encodeMessage(revealMessage(reveal)), to: new WeakSet() }
      if (!this.sentReveal.to.has(actor)) {
        actor.send(ServerTopic.REVEAL, this.sentReveal.text)
        this.sentReveal.to.add(actor)
      }
    }
    actor.send(ServerTopic.STATE, encodeMessage(stateMessage(view)))
  }

  private broadcastState(): void {
    const now = deps.clock.now()
    this.each((actor) => this.sendState(actor, now))
    this.armTimer()
  }

  private armTimer(): void {
    this.clearTimer()
    const at = this.game.nextWakeAt()
    if (at === undefined) return
    const delay = Math.max(0, at - deps.clock.now())
    this.timer = deps.clock.setTimeout(() => {
      this.timer = undefined
      // Rivalis catches what message handlers throw, but nothing catches a
      // timer: one room's bug would end the process and every game in it.
      try {
        if (this.game.tick(deps.clock.now())) this.broadcastState()
        else this.armTimer()
      } catch (error) {
        this.logger?.error(`tick threw: ${error instanceof Error ? error.message : String(error)}`)
      }
    }, delay)
  }

  private clearTimer(): void {
    if (this.timer !== undefined) deps.clock.clearTimeout(this.timer)
    this.timer = undefined
  }

  /** Test hook. */
  get state(): Game {
    return this.game
  }
}

type Handler<T> = (token: PlayerToken, body: T, now: Instant) => CommandResult
type Commands = { [K in JsonTopic]: Handler<ClientMessages[K]> }
/** One handler per topic, paint included, each given its topic's parsed body. */
type Handlers = Commands & { [ClientTopic.PAINT]: Handler<PaintSubmission> }
