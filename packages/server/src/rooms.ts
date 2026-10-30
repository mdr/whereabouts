/**
 * Rivalis adapter: one GameRoom per game code, each owning a pure Game.
 * This is the only module that knows about Rivalis rooms and actors; the
 * Game itself is I/O free and tested on its own.
 */
import {
  type Actor,
  AuthMiddleware,
  Room,
  type AuthResult,
  type ConnectionContext,
  type RoomManager
} from "@rivalis/core"
import { type z } from "zod"
import {
  ClientMessageSchemas,
  SEAT_GRACE_MS,
  ServerTopics,
  decodeMessage,
  decodeTicket,
  encodeMessage,
  revealMessage,
  stateMessage,
  type GameConfig,
  type PaintSubmission,
  type RoundReveal
} from "@whereabouts/shared/protocol"
import { Game, generateCode, type QuestionBank } from "@whereabouts/shared/game"
import { QUESTIONS, type QuestionData } from "@whereabouts/shared/questions"
import { decodePaint, encodePaint } from "@whereabouts/shared/paint-wire"
import type { CloseReason } from "@whereabouts/shared/close-reason"
import { featureFrom, regionFrom, type RegionData } from "@whereabouts/shared/regions"
import { flagFrom, type FlagData } from "@whereabouts/shared/flags"
import { roomCode, type PlayerId, type PlayerName, type PlayerToken } from "@whereabouts/shared/ids"
// The countries for "Paint the whole of …" rounds, the flag rounds, and the
// islands, lakes, seas and US states. The client loads the same files on
// demand; the server holds them all.
import regionsJson from "@whereabouts/shared/regions.json" with { type: "json" }
import flagsJson from "@whereabouts/shared/flags.json" with { type: "json" }
import featuresJson from "@whereabouts/shared/features.json" with { type: "json" }
import { TicketRefused } from "./vendor/WSTransport.ts"

/** Close reasons are codes from the shared list, which the client words. */
const closeReason = (reason: CloseReason): string => reason

export const BANK: QuestionBank = {
  pool: QUESTIONS,
  regions: (regionsJson as RegionData[]).map(regionFrom),
  flags: (flagsJson as FlagData[]).map(flagFrom),
  features: (featuresJson as (QuestionData | RegionData)[]).map(featureFrom)
}

export interface ActorData {
  token: PlayerToken
  name: PlayerName
  /** Asked to join as a spectator. */
  watch: boolean
  /** The client's network address, for the logs. */
  address: string
}

export const ROOM_TYPE = "game"

/** Injected clock so tests can drive time. */
export interface Clock {
  now(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>)
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
export function configureGameRooms(next: Partial<GameRoomDeps>): void {
  deps = { ...deps, ...next }
}

export class GameRoom extends Room<ActorData> {
  // Not Rivalis's destroyOnEmpty, which closes the room the moment the last
  // player drops: a lone host's refresh would lose the game. An empty room
  // stays open for SEAT_GRACE_MS instead (see onLeave).
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
    for (const [topic, schema] of Object.entries(ClientMessageSchemas)) {
      this.bind(topic, (actor, payload) => this.handle(actor, topic, readJson(topic, schema, payload)))
    }
    this.bind("paint", (actor, payload) => this.handle(actor, "paint", readPaint(payload)))
  }

  protected override onJoin(actor: Actor<ActorData>): void {
    const { token, name, watch, address } = actor.data!
    this.cancelEmptyTimer()
    const previous = this.actorsByToken.get(token)
    if (previous && previous !== actor) previous.kick(closeReason("replaced"))
    this.actorsByToken.set(token, actor)
    const back = this.game.playerTokens.includes(token)
    const result = this.game.join(token, name, deps.clock.now(), watch)
    if (!result.ok) {
      this.logger?.info(`${actor.id} (${name}, ${address}) turned away: ${result.reason}`)
      actor.kick(closeReason(result.reason))
      return
    }
    this.logger?.info(`${actor.id} (${name}, ${address}) ${back ? "rejoined" : "joined"}`)
    const paint = this.game.paintOf(token)
    if (paint) actor.send(ServerTopics.paint, encodePaint(paint))
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
      }, SEAT_GRACE_MS)
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

  private handle(actor: Actor<ActorData>, topic: string, parsed: Parsed): void {
    if (!parsed.ok) {
      this.logger?.warning(`${actor.id} (${actor.data!.name}) sent ${topic}: ${parsed.error}`)
      this.sendError(actor, parsed.error)
      return
    }
    const token = actor.data!.token
    const now = deps.clock.now()
    const result = this.dispatch(topic, token, parsed.data, now)
    if (!result.ok) {
      this.sendError(actor, result.error)
      return
    }
    if (result.changed) this.broadcastState()
  }

  private dispatch(topic: string, token: PlayerToken, data: unknown, now: number) {
    switch (topic) {
      case "paint":
        return this.game.setPaint(token, data as PaintSubmission)
      case "lock":
        return this.game.lock(token, now)
      case "unlock":
        return this.game.unlock(token)
      case "ready":
        return this.game.ready(token, now)
      case "configure":
        return this.game.configure(token, data as z.infer<typeof ClientMessageSchemas.configure>)
      case "start":
        return this.game.start(token, now)
      case "next":
        return this.game.next(token, now)
      case "again":
        return this.game.again(token, now)
      case "rename":
        return this.game.rename(token, (data as z.infer<typeof ClientMessageSchemas.rename>).name)
      case "kick":
        return this.removePlayer(token, (data as z.infer<typeof ClientMessageSchemas.kick>).playerId, now)
      case "setRole":
        return this.game.setRole(token, (data as z.infer<typeof ClientMessageSchemas.setRole>).watch)
      case "leave":
        return this.leave(token)
      case "makeHost":
        return this.game.makeHost(token, (data as z.infer<typeof ClientMessageSchemas.makeHost>).playerId)
      case "end":
        return this.game.end(token)
      case "hint":
        return this.game.hint(token, (data as z.infer<typeof ClientMessageSchemas.hint>).axis)
      default:
        return { ok: false as const, error: "unknown topic" }
    }
  }

  /** Give up this player's seat and close their connection; the client closes it too. */
  private leave(token: PlayerToken) {
    const result = this.game.leave(token)
    if (result.ok) this.actorsByToken.get(token)?.kick(closeReason("left"))
    return result
  }

  /** Remove a player from the game and close their connection, telling them why. */
  private removePlayer(token: PlayerToken, playerId: PlayerId, now: number) {
    const target = this.game.tokenOf(playerId)
    const result = this.game.kick(token, playerId, now)
    if (result.ok && target !== undefined) this.actorsByToken.get(target)?.kick(closeReason("removed"))
    return result
  }

  private sendError(actor: Actor<ActorData>, message: string): void {
    actor.send(ServerTopics.error, encodeMessage({ message }))
  }

  /** Views are per player (host flag, lock state), so each is sent on its own. */
  private sendState(actor: Actor<ActorData>, now = deps.clock.now()): void {
    const reveal = this.game.roundReveal
    if (reveal) {
      if (this.sentReveal?.reveal !== reveal)
        this.sentReveal = { reveal, text: encodeMessage(revealMessage(reveal)), to: new WeakSet() }
      if (!this.sentReveal.to.has(actor)) {
        actor.send(ServerTopics.reveal, this.sentReveal.text)
        this.sentReveal.to.add(actor)
      }
    }
    actor.send(ServerTopics.state, encodeMessage(stateMessage(this.game.view(actor.data!.token, now))))
  }

  private broadcastState(): void {
    const now = deps.clock.now()
    this.each((actor) => this.sendState(actor, now))
    this.joinable = this.game.phase !== "results"
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

type Parsed = { ok: true; data: unknown } | { ok: false; error: string }

function readJson(topic: string, schema: z.ZodType, payload: Uint8Array): Parsed {
  let body: unknown
  try {
    body = decodeMessage(payload)
  } catch {
    return { ok: false, error: "malformed message" }
  }
  const parsed = schema.safeParse(body)
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: `invalid ${topic}` }
}

function readPaint(payload: Uint8Array): Parsed {
  const paint = decodePaint(payload)
  return paint ? { ok: true, data: paint } : { ok: false, error: "invalid paint" }
}

/**
 * Parses the ticket, creates the room for hosts, and routes joiners to their
 * game by code. Rivalis rejects the join itself if the room is full or not
 * joinable.
 */
export class GameAuth extends AuthMiddleware<ActorData> {
  private rooms: () => RoomManager<ActorData>

  constructor(rooms: () => RoomManager<ActorData>) {
    super()
    this.rooms = rooms
  }

  override async authenticate(ticket: string, context?: ConnectionContext) {
    return this.route(ticket, context?.remoteId ?? "unknown")
  }

  private route(ticket: string, address: string): AuthResult<ActorData> {
    const parsed = decodeTicket(ticket)
    if (parsed === "outdated") throw new TicketRefused(closeReason("outdated"))
    if (!parsed) throw new TicketRefused(closeReason("noSuchGame"))
    const rooms = this.rooms()
    let roomId: string
    if (parsed.create && parsed.code) {
      // Hosting again under an old code; if someone just did, join them.
      roomId = parsed.code
      if (!rooms.get(roomId)) rooms.create(ROOM_TYPE, roomId)
    } else if (parsed.create) {
      roomId = generateCode()
      for (let i = 0; i < 20 && rooms.get(roomId); i++) roomId = generateCode()
      if (rooms.get(roomId)) throw new TicketRefused(closeReason("unavailable"))
      rooms.create(ROOM_TYPE, roomId)
    } else if (parsed.code && rooms.get(parsed.code)) {
      roomId = parsed.code
    } else {
      throw new TicketRefused(closeReason("noSuchGame"))
    }
    return { data: { token: parsed.token, name: parsed.name, watch: parsed.watch ?? false, address }, roomId }
  }
}
