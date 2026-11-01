/** Who is in the room: seats, colours, capacity, the grace for absent players, bans, and the host role. */
import { playerColour, type PlayerColour } from "../colours.ts"
import { playerId, type PlayerId, type PlayerName, type PlayerToken } from "../ids.ts"
import { MAX_PLAYERS, MAX_SPECTATORS, SEAT_GRACE } from "../protocol.ts"
import { CloseReason } from "../close-reason.ts"
import { Role } from "../roles.ts"
import { OK_CHANGED, fail, type CommandResult, type JoinResult } from "./command-result.ts"
import type { RoundFacts } from "../awards/awards.ts"
import type { Instant, Points } from "../units.ts"

/** Who someone is and how they are connected: kept from one game to the next. */
export interface Seat {
  id: PlayerId
  token: PlayerToken
  name: PlayerName
  role: SeatRole
  connected: boolean
  /** When the connection dropped, while it is down. */
  leftAt: Instant | undefined
  joinedAt: Instant
}

/** A player's part in one game, started afresh by freshRecord. */
export interface PlayerRecord {
  /** First round index this player may play. Later joiners sit out the current one. */
  joinedRound: number
  /** By round index; a hole for each round not played. */
  scores: (Points | undefined)[]
  /** By round index, for the awards; a hole for each round not played. */
  facts: (RoundFacts | undefined)[]
  previousRank: number | undefined
  hintsUsed: number
}

/** Plays: has a colour and a record of the game. */
export interface PlayerRole {
  type: Role.PLAYER
  colour: PlayerColour
  record: PlayerRecord
}

/** Sees every round, plays none, and is never waited on. */
interface SpectatorRole {
  type: Role.SPECTATOR
}

type SeatRole = PlayerRole | SpectatorRole

const SPECTATOR_ROLE: SpectatorRole = { type: Role.SPECTATOR }

export type PlayerSeat = Seat & { role: PlayerRole }

export const isPlayer = (seat: Seat): seat is PlayerSeat => seat.role.type === Role.PLAYER

export const freshRecord = (joinedRound: number): PlayerRecord => ({
  joinedRound,
  scores: [],
  facts: [],
  previousRank: undefined,
  hintsUsed: 0
})

export class Seats {
  private readonly players = new Map<PlayerToken, Seat>()
  private hostToken: PlayerToken | undefined = undefined
  private nextPlayerId = 1
  /** Tokens the host has removed; they may not reclaim a seat. */
  private readonly kicked = new Set<PlayerToken>()

  get(token: PlayerToken): Seat | undefined {
    return this.players.get(token)
  }

  all(): Seat[] {
    return [...this.players.values()]
  }

  /** The players, leaving out spectators. */
  playing(): PlayerSeat[] {
    return this.all().filter(isPlayer)
  }

  private spectatorCount(): number {
    return this.players.size - this.playing().length
  }

  /** The lowest colour no current player has, so a removed player's colour is reused. */
  private freeColour(): PlayerColour {
    const used = new Set<number | undefined>(this.playing().map((seat) => seat.role.colour))
    let colour = 0
    while (used.has(colour)) colour++
    return playerColour(colour)
  }

  get size(): number {
    return this.players.size
  }

  get connectedCount(): number {
    let count = 0
    for (const seat of this.players.values()) if (seat.connected) count++
    return count
  }

  get tokens(): PlayerToken[] {
    return [...this.players.keys()]
  }

  /** The token behind a public player id. */
  tokenOf(id: PlayerId): PlayerToken | undefined {
    for (const seat of this.players.values()) if (seat.id === id) return seat.token
    return undefined
  }

  isBanned(token: PlayerToken): boolean {
    return this.kicked.has(token)
  }

  /** A known token reclaims its seat, and the host role if it was theirs. False for an unknown token. */
  reconnect(token: PlayerToken): boolean {
    const existing = this.players.get(token)
    if (!existing) return false
    existing.connected = true
    existing.leftAt = undefined
    this.hostToken ??= token
    return true
  }

  private playerRole(joinedRound: number): PlayerRole {
    return { type: Role.PLAYER, colour: this.freeColour(), record: freshRecord(joinedRound) }
  }

  /**
   * Seat a newcomer. They play unless they asked to watch, or all MAX_PLAYERS
   * seats are taken, in which case they watch if there is room for another
   * spectator.
   */
  admit(token: PlayerToken, name: PlayerName, now: Instant, role: Role, joinedRound: number): JoinResult {
    const seatFree = this.playing().length < MAX_PLAYERS
    const roomToWatch = this.spectatorCount() < MAX_SPECTATORS
    let seatRole: SeatRole
    if (role === Role.PLAYER && seatFree) seatRole = this.playerRole(joinedRound)
    else if (roomToWatch) seatRole = SPECTATOR_ROLE
    else return { ok: false, reason: seatFree ? CloseReason.NO_ROOM_TO_WATCH : CloseReason.FULL }
    const seat: Seat = {
      id: playerId(`p${this.nextPlayerId++}`),
      token,
      name,
      role: seatRole,
      connected: true,
      leftAt: undefined,
      joinedAt: now
    }
    this.players.set(token, seat)
    this.hostToken ??= token
    return OK_CHANGED
  }

  /** The seat goes, and the host role, if it was theirs, passes on. */
  remove(token: PlayerToken): void {
    this.players.delete(token)
    if (this.hostToken === token) this.hostToken = this.pickHost()
  }

  /** Remove a player whose token may not rejoin. */
  ban(token: PlayerToken): void {
    this.remove(token)
    this.kicked.add(token)
  }

  /** Switch between watching (the colour is given up) and playing a free seat, as capacity allows. */
  setRole(seat: Seat, role: Role, joinedRound: number): CommandResult {
    if (role === Role.SPECTATOR) {
      if (this.spectatorCount() >= MAX_SPECTATORS) return fail("no room to watch")
      seat.role = SPECTATOR_ROLE
    } else {
      if (this.playing().length >= MAX_PLAYERS) return fail("game is full")
      seat.role = this.playerRole(joinedRound)
    }
    return OK_CHANGED
  }

  /** Hand the host role to another connected player, for good. */
  handOver(token: PlayerToken, id: PlayerId): CommandResult {
    if (!this.isHost(token)) return fail("only the host can hand over")
    const target = this.tokenOf(id)
    if (target === undefined) return fail("unknown player")
    if (target === token) return fail("you are already the host")
    if (!this.players.get(target)!.connected) return fail("that player is offline")
    this.hostToken = target
    return OK_CHANGED
  }

  private pickHost(passOver?: PlayerToken): PlayerToken | undefined {
    let best: Seat | undefined = undefined
    for (const seat of this.players.values()) {
      if (!seat.connected || seat.token === passOver) continue
      if (!best || seat.joinedAt < best.joinedAt) best = seat
    }
    return best?.token
  }

  /** Who may use the host controls right now: the host if connected, else the acting host. */
  effectiveHost(): PlayerToken | undefined {
    const host = this.hostToken ? this.players.get(this.hostToken) : undefined
    if (host?.connected) return host.token
    return this.pickHost() ?? this.hostToken
  }

  isHost(token: PlayerToken): boolean {
    return this.effectiveHost() === token
  }

  /** Who would take over if this player, the host, went. */
  nextHost(token: PlayerToken): PlayerId | undefined {
    if (!this.isHost(token)) return undefined
    const next = this.pickHost(token)
    return next ? this.players.get(next)!.id : undefined
  }

  /** In the lobby, free the seats of players gone longer than SEAT_GRACE, and the host role with one. */
  freeLapsed(now: Instant): boolean {
    let changed = false
    for (const [token, seat] of this.players) {
      if (seat.leftAt === undefined || now < seat.leftAt + SEAT_GRACE) continue
      this.players.delete(token)
      changed = true
    }
    if (changed && this.hostToken !== undefined && !this.players.has(this.hostToken)) this.hostToken = this.pickHost()
    return changed
  }

  /** When the first absent player's grace runs out, if any is absent. */
  nextLapseAt(): Instant | undefined {
    let at: Instant | undefined = undefined
    for (const seat of this.players.values()) {
      if (seat.leftAt === undefined) continue
      const due = seat.leftAt + SEAT_GRACE
      if (at === undefined || due < at) at = due
    }
    return at
  }
}
