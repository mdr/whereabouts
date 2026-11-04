/**
 * The game's rules about who may do what and what happens next, said as plainly as possible,
 * to check Game against. Knows nothing of paint, scores, questions or colours.
 */
import { CloseReason } from "../../close-reason.ts"
import type { PlayerToken } from "../../ids.ts"
import { MAX_PLAYERS, MAX_SPECTATORS, SEAT_GRACE } from "../../protocol/config.ts"
import { Phase } from "../../protocol/views.ts"
import { Role } from "../../roles.ts"
import type { Instant, Ms } from "../../units.ts"
import { ROUND_GRACE } from "../game.ts"

export interface ModelSeat {
  token: PlayerToken
  name: string
  /** Order of arrival: the longest-standing connected seat stands in for an absent host. */
  arrival: number
  role: Role
  connected: boolean
  leftAt: Instant | undefined
  joinedRound: number
  hintsUsed: number
}

/** What a command should return: refused, or accepted and whether anyone's view changed. */
export type Expected = { ok: false; reason?: CloseReason } | { ok: true; changed: boolean }

const REFUSED: Expected = { ok: false }
const CHANGED: Expected = { ok: true, changed: true }
const SAME: Expected = { ok: true, changed: false }

export class GameModel {
  phase: Phase = Phase.LOBBY
  round = 0
  /** Counts games: Play again starts another. */
  game = 0
  seats: ModelSeat[] = []
  host: PlayerToken | undefined = undefined
  banned = new Set<PlayerToken>()
  lockedIn = new Set<PlayerToken>()
  readied = new Set<PlayerToken>()
  hinted = new Set<PlayerToken>()
  deadline: Instant | undefined = undefined
  private arrivals = 0

  constructor(
    readonly totalRounds: number,
    readonly roundLength: Ms | undefined,
    readonly hints: number | undefined
  ) {}

  seat(token: PlayerToken): ModelSeat | undefined {
    return this.seats.find((seat) => seat.token === token)
  }

  /** The host if connected, else the longest-standing connected seat, else the absent host. */
  actingHost(): PlayerToken | undefined {
    if (this.seat(this.host!)?.connected) return this.host
    return this.longestStanding() ?? this.host
  }

  private longestStanding(): PlayerToken | undefined {
    return this.seats.filter((seat) => seat.connected).sort((a, b) => a.arrival - b.arrival)[0]?.token
  }

  private isHost(token: PlayerToken): boolean {
    return this.actingHost() === token
  }

  /** Whether this seat plays the round under way: a player seated before it began. */
  playsRound(seat: ModelSeat): boolean {
    return seat.role === Role.PLAYER && seat.joinedRound <= this.round
  }

  private inPlay(): boolean {
    return this.phase === Phase.GUESSING || this.phase === Phase.REVEAL
  }

  /** The first round a seat taken now may play. */
  private joiningRound(): number {
    return this.inPlay() ? this.round + 1 : 0
  }

  private players(): ModelSeat[] {
    return this.seats.filter((seat) => seat.role === Role.PLAYER)
  }

  private drop(token: PlayerToken): void {
    this.seats = this.seats.filter((seat) => seat.token !== token)
    this.lockedIn.delete(token)
    this.readied.delete(token)
    if (this.host === token) this.host = this.longestStanding()
  }

  join(token: PlayerToken, name: string, role: Role): Expected {
    const known = this.seat(token)
    if (known) {
      known.connected = true
      known.leftAt = undefined
      this.host ??= token
      return CHANGED
    }
    if (this.banned.has(token)) return { ok: false, reason: CloseReason.REMOVED }
    if (this.phase === Phase.RESULTS) return { ok: false, reason: CloseReason.FINISHED }
    const seatFree = this.players().length < MAX_PLAYERS
    const roomToWatch = this.seats.length - this.players().length < MAX_SPECTATORS
    const plays = role === Role.PLAYER && seatFree
    if (!plays && !roomToWatch) return { ok: false, reason: seatFree ? CloseReason.NO_ROOM_TO_WATCH : CloseReason.FULL }
    this.seats.push({
      token,
      name,
      arrival: this.arrivals++,
      role: plays ? Role.PLAYER : Role.SPECTATOR,
      connected: true,
      leftAt: undefined,
      joinedRound: this.joiningRound(),
      hintsUsed: 0
    })
    this.host ??= token
    return CHANGED
  }

  disconnect(token: PlayerToken, now: Instant): Expected {
    const seat = this.seat(token)
    if (!seat) return SAME
    seat.connected = false
    seat.leftAt = now
    this.settle(now)
    return CHANGED
  }

  leave(token: PlayerToken): Expected {
    if (!this.seat(token) || this.phase !== Phase.LOBBY) return REFUSED
    this.drop(token)
    return CHANGED
  }

  start(token: PlayerToken, now: Instant): Expected {
    if (!this.isHost(token) || this.phase !== Phase.LOBBY || !this.players().some((seat) => seat.connected))
      return REFUSED
    for (const seat of this.players()) {
      seat.joinedRound = 0
      seat.hintsUsed = 0
    }
    this.beginRound(0, now)
    return CHANGED
  }

  next(token: PlayerToken, now: Instant): Expected {
    if (!this.isHost(token) || this.phase !== Phase.REVEAL) return REFUSED
    this.advance(now)
    return CHANGED
  }

  again(token: PlayerToken, now: Instant): Expected {
    if (!this.isHost(token) || this.phase !== Phase.RESULTS) return REFUSED
    this.phase = Phase.LOBBY
    this.round = 0
    this.game++
    for (const seat of this.players()) {
      seat.joinedRound = 0
      seat.hintsUsed = 0
    }
    // Back in a lobby: anyone away has the lobby's grace to come back, from now.
    for (const seat of this.seats) if (!seat.connected) seat.leftAt = now
    return CHANGED
  }

  setRole(token: PlayerToken, role: Role): Expected {
    const seat = this.seat(token)
    if (!seat) return REFUSED
    if (seat.role === role) return SAME
    if (role === Role.SPECTATOR && this.phase !== Phase.LOBBY) return REFUSED
    if (this.phase === Phase.RESULTS) return REFUSED
    if (role === Role.SPECTATOR) {
      if (this.seats.length - this.players().length >= MAX_SPECTATORS) return REFUSED
    } else if (this.players().length >= MAX_PLAYERS) return REFUSED
    seat.role = role
    seat.joinedRound = this.joiningRound()
    seat.hintsUsed = 0
    return CHANGED
  }

  makeHost(token: PlayerToken, target: PlayerToken): Expected {
    const seat = this.seat(target)
    if (!this.isHost(token) || !seat || target === token || !seat.connected) return REFUSED
    this.host = target
    return CHANGED
  }

  kick(token: PlayerToken, target: PlayerToken, now: Instant): Expected {
    if (!this.isHost(token) || this.phase === Phase.RESULTS || !this.seat(target) || target === token) return REFUSED
    this.drop(target)
    this.banned.add(target)
    this.settle(now)
    return CHANGED
  }

  end(token: PlayerToken): Expected {
    if (!this.isHost(token) || !this.inPlay()) return REFUSED
    this.phase = Phase.RESULTS
    return CHANGED
  }

  rename(token: PlayerToken, name: string): Expected {
    const seat = this.seat(token)
    if (!seat) return REFUSED
    if (seat.name === name) return SAME
    seat.name = name
    return CHANGED
  }

  hint(token: PlayerToken): Expected {
    const seat = this.seat(token)
    if (!seat || this.phase !== Phase.GUESSING || !this.playsRound(seat)) return REFUSED
    if (this.hinted.has(token)) return REFUSED
    if (this.hints !== undefined && seat.hintsUsed >= this.hints) return REFUSED
    this.hinted.add(token)
    seat.hintsUsed++
    return CHANGED
  }

  /** Paint is private until the reveal, so nobody's view changes; late paint is dropped quietly. */
  paint(token: PlayerToken): Expected {
    const seat = this.seat(token)
    if (!seat || seat.role === Role.SPECTATOR) return REFUSED
    if (this.phase !== Phase.GUESSING) return SAME
    if (!this.playsRound(seat)) return REFUSED
    return SAME
  }

  /** Done. Pressed as the round ended it is stale, not wrong. */
  lock(token: PlayerToken, now: Instant): Expected {
    const seat = this.seat(token)
    if (!seat) return REFUSED
    if (this.phase !== Phase.GUESSING) return SAME
    if (!this.playsRound(seat)) return REFUSED
    if (this.lockedIn.has(token)) return SAME
    this.lockedIn.add(token)
    this.settle(now)
    return CHANGED
  }

  unlock(token: PlayerToken): Expected {
    if (!this.seat(token)) return REFUSED
    if (this.phase !== Phase.GUESSING || !this.lockedIn.has(token)) return SAME
    this.lockedIn.delete(token)
    return CHANGED
  }

  /** Done reading the reveal. Pressed just after it moved on, it is stale, not wrong. */
  ready(token: PlayerToken, now: Instant): Expected {
    const seat = this.seat(token)
    if (!seat) return REFUSED
    if (this.phase !== Phase.REVEAL) return SAME
    if (seat.role === Role.SPECTATOR) return REFUSED
    if (this.readied.has(token)) return SAME
    this.readied.add(token)
    this.settle(now)
    return CHANGED
  }

  /** Time passes to `now`: a round runs out, or an absent lobby seat's grace does. */
  tick(now: Instant): boolean {
    if (this.phase === Phase.LOBBY) {
      const lapsed = this.seats.filter((seat) => seat.leftAt !== undefined && now >= seat.leftAt + SEAT_GRACE)
      for (const seat of lapsed) this.drop(seat.token)
      return lapsed.length > 0
    }
    if (this.phase === Phase.GUESSING && this.deadline !== undefined && now >= this.deadline + ROUND_GRACE) {
      this.closeRound()
      return true
    }
    return false
  }

  /** Each waiting phase ends once everyone still here is done, if anyone is here. */
  private settle(now: Instant): void {
    if (this.phase === Phase.GUESSING) {
      const waitingOn = this.seats.filter((seat) => seat.connected && this.playsRound(seat))
      if (waitingOn.length > 0 && waitingOn.every((seat) => this.lockedIn.has(seat.token))) this.closeRound()
    } else if (this.phase === Phase.REVEAL) {
      const waitingOn = this.players().filter((seat) => seat.connected)
      if (waitingOn.length > 0 && waitingOn.every((seat) => this.readied.has(seat.token))) this.advance(now)
    }
  }

  private beginRound(round: number, now: Instant): void {
    this.phase = Phase.GUESSING
    this.round = round
    this.lockedIn.clear()
    this.hinted.clear()
    this.deadline = this.roundLength === undefined ? undefined : now + this.roundLength
  }

  private closeRound(): void {
    this.phase = Phase.REVEAL
    this.readied.clear()
  }

  private advance(now: Instant): void {
    if (this.round + 1 < this.totalRounds) this.beginRound(this.round + 1, now)
    else this.phase = Phase.RESULTS
  }
}
