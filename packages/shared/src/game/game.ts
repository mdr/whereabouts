/**
 * Pure multiplayer game state machine. No I/O, no timers: callers pass `now`
 * and poll `nextWakeAt()` to know when to call `tick`. Every mutator returns
 * whether anything changed so the transport layer can rebroadcast views.
 */
import { DEFAULT_KERNEL, kernelById, type Kernel } from "../scoring/scoring.ts"
import type { Question } from "../questions.ts"
import { playedRound, revealOf, roundHintBand, roundView, upcomingOf } from "./game-views.ts"
import { pickRounds, type QuestionBank } from "./round-picking.ts"
import { scorePlayers } from "./round-results.ts"
import { SubmissionType } from "../scoring/round-scoring.ts"
import { pickAwards } from "../awards/awards.ts"
import { DEFAULT_HINTS, type HintAxis, type HintBand } from "../hints.ts"
import type { PlayerId, PlayerName, PlayerToken, RoomCode } from "../ids.ts"
import { evenMix, MapDetail, Phase } from "../protocol.ts"
import type { ConfigurePatch, GameConfig, GameView, PaintSubmission, RoundReveal, YouView } from "../protocol.ts"
import { CloseReason } from "../close-reason.ts"
import { OK_CHANGED, OK_SAME, fail, type CommandResult, type JoinResult } from "./command-result.ts"
import { sameData } from "./same-data.ts"
import { Seats, freshRecord, type PlayerSeat, type Seat } from "./seats.ts"
import { Role } from "../roles.ts"
import { awardFacts, finalStandings, playerViews } from "./standings.ts"
import {
  isLocked,
  joiningRound,
  LOBBY_STATE,
  lockedIn,
  playsRound,
  type GameState,
  type GuessingState,
  type InPlayState,
  type RevealState,
  type ResultsState,
  type Round
} from "./state.ts"
import type { Instant, Ms } from "../units.ts"

const DEFAULT_CONFIG: GameConfig = {
  roundLength: 60_000,
  mix: evenMix(8),
  mapDetail: MapDetail.MINIMAL,
  kernelId: DEFAULT_KERNEL.id,
  hints: DEFAULT_HINTS
}

/**
 * How long after the deadline a round is scored. Clients stop painting at
 * zero and send what they have; this lets that paint arrive.
 */
export const ROUND_GRACE: Ms = 1000

/** Someone to wait on, and nobody still to wait for. */
const everyoneDone = (waitingOn: PlayerSeat[], done: (p: PlayerSeat) => boolean): boolean =>
  waitingOn.length > 0 && waitingOn.every(done)

export class Game {
  readonly code: RoomCode
  config: GameConfig
  private readonly bank: QuestionBank
  private readonly kernel: Kernel

  private state: GameState = LOBBY_STATE
  private readonly seats = new Seats()

  private questions: Question[] = []

  private seed: number

  constructor(
    code: RoomCode,
    bank: QuestionBank,
    { config = {}, seed = Date.now() }: { config?: Partial<GameConfig>; seed?: number } = {}
  ) {
    this.seed = seed
    this.code = code
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.bank = bank
    this.kernel = kernelById(this.config.kernelId)
    if (bank.catalogue.length === 0) throw new Error("question catalogue is empty")
    this.questions = pickRounds(this.bank, this.config, this.seed)
  }

  get phase(): Phase {
    return this.state.phase
  }

  // ---- membership ----------------------------------------------------------

  /**
   * Join or reconnect. A known token reclaims its seat (and the host role, if
   * it was theirs) in whatever role it had. A newcomer plays unless they asked
   * to watch, or all MAX_PLAYERS seats are taken, in which case they watch if
   * there is room for another spectator.
   */
  join(token: PlayerToken, name: PlayerName, now: Instant, role: Role = Role.PLAYER): JoinResult {
    if (this.seats.reconnect(token)) return OK_CHANGED
    if (this.seats.isBanned(token)) return { ok: false, reason: CloseReason.REMOVED }
    if (this.state.phase === Phase.RESULTS) return { ok: false, reason: CloseReason.FINISHED }
    return this.seats.admit(token, name, now, role, joiningRound(this.state))
  }

  /**
   * Connection dropped. The seat is held, so a refresh takes it back: in the
   * lobby for SEAT_GRACE (then tick frees it), mid-game for good. The
   * host keeps the role while away; the longest-standing connected player
   * acts as host in the meantime.
   */
  disconnect(token: PlayerToken, now: Instant): CommandResult {
    const player = this.seats.get(token)
    if (!player) return OK_SAME
    player.connected = false
    player.leftAt = now
    // The others should not wait on someone who has gone.
    this.settleIfEveryoneDone(now)
    return OK_CHANGED
  }

  /**
   * Leave the lobby on purpose: the seat goes now rather than after the
   * grace period, and the host role, if it was theirs, passes on. From the
   * lobby only; mid-game the seat is kept whatever happens.
   */
  leave(token: PlayerToken): CommandResult {
    if (!this.seats.get(token)) return fail("unknown player")
    if (this.state.phase !== Phase.LOBBY) return fail("you can only leave from the lobby")
    this.seats.remove(token)
    return OK_CHANGED
  }

  private nextHostView(token: PlayerToken): { nextHost?: PlayerId } {
    const nextHost = this.seats.nextHost(token)
    return nextHost ? { nextHost } : {}
  }

  get playerCount(): number {
    return this.seats.size
  }

  get connectedCount(): number {
    return this.seats.connectedCount
  }

  // ---- host commands -------------------------------------------------------

  start(token: PlayerToken, now: Instant): CommandResult {
    if (!this.seats.isHost(token)) return fail("only the host can start")
    if (this.state.phase !== Phase.LOBBY) return fail("game already started")
    if (this.seats.playing().length === 0) return fail("no players")
    const first = this.roundAt(0)
    if (!first) return fail("no rounds to play")
    for (const p of this.seats.playing()) p.role.record = freshRecord(0)
    this.state = this.beginRound(first, now)
    return OK_CHANGED
  }

  /** Host tunes the question mix (and so the rounds), round length and map detail while everyone is still in the lobby. */
  configure(token: PlayerToken, patch: ConfigurePatch): CommandResult {
    if (!this.seats.isHost(token)) return fail("only the host can change settings")
    if (this.state.phase !== Phase.LOBBY) return fail("settings are locked once the game starts")
    const next = { ...this.config, ...patch }
    if (sameData(next, this.config)) return OK_SAME
    this.config = next
    this.questions = pickRounds(this.bank, this.config, this.seed)
    return OK_CHANGED
  }

  /** Host advances from the reveal without waiting for the others. */
  next(token: PlayerToken, now: Instant): CommandResult {
    if (!this.seats.isHost(token)) return fail("only the host can advance")
    const s = this.state
    if (s.phase !== Phase.REVEAL) return fail("nothing to advance")
    this.state = this.advance(s, now)
    return OK_CHANGED
  }

  again(token: PlayerToken, now: Instant): CommandResult {
    if (!this.seats.isHost(token)) return fail("only the host can restart")
    if (this.state.phase !== Phase.RESULTS) return fail("game is still running")
    this.state = LOBBY_STATE
    this.seed = now
    this.questions = pickRounds(this.bank, this.config, this.seed)
    for (const p of this.seats.playing()) p.role.record = freshRecord(0)
    // Back in a lobby, anyone away has its grace to come back, from now.
    for (const p of this.seats.all()) if (!p.connected) p.leftAt = now
    return OK_CHANGED
  }

  /**
   * Watch instead of playing (the colour is given up), in the lobby only, since
   * a player mid-game has scores. Or take a free seat: in the lobby, or
   * mid-game like a late joiner, sitting out the round under way and playing
   * from the next. Not on the final results; Play again starts a new lobby.
   */
  setRole(token: PlayerToken, role: Role): CommandResult {
    const seat = this.seats.get(token)
    if (!seat) return fail("unknown player")
    if (seat.role.type === role) return OK_SAME
    if (role === Role.SPECTATOR && this.state.phase !== Phase.LOBBY) {
      return fail("you can only switch to watching in the lobby")
    }
    if (this.state.phase === Phase.RESULTS) return fail("game has finished")
    return this.seats.setRole(seat, role, joiningRound(this.state))
  }

  /** Hand the host role to another connected player, for good. */
  makeHost(token: PlayerToken, playerId: PlayerId): CommandResult {
    return this.seats.handOver(token, playerId)
  }

  /** The token behind a public player id, for the server to act on a kick. */
  tokenOf(playerId: PlayerId): PlayerToken | undefined {
    return this.seats.tokenOf(playerId)
  }

  /**
   * Remove a player. Their seat, score and paint go; their token may not
   * rejoin (a fresh token can, as a new player). The acting host may remove
   * an absent host, in which case the role passes on.
   */
  kick(token: PlayerToken, playerId: PlayerId, now: Instant): CommandResult {
    if (!this.seats.isHost(token)) return fail("only the host can remove players")
    const target = this.tokenOf(playerId)
    if (target === undefined) return fail("unknown player")
    if (target === token) return fail("you cannot remove yourself")
    this.seats.ban(target)
    this.forget(target)
    this.settleIfEveryoneDone(now)
    return OK_CHANGED
  }

  /** Stop after the current round: score it if it is still running, then show final standings. */
  end(token: PlayerToken): CommandResult {
    if (!this.seats.isHost(token)) return fail("only the host can end the game")
    const s = this.state
    if (s.phase === Phase.GUESSING) this.state = this.finish(this.closeRound(s).round)
    else if (s.phase === Phase.REVEAL) this.state = this.finish(s.round)
    else return fail("nothing to end")
    return OK_CHANGED
  }

  /** Drop what a removed player had in the phase under way. */
  private forget(token: PlayerToken): void {
    const s = this.state
    if (s.phase === Phase.GUESSING) s.submissions.delete(token)
    else if (s.phase === Phase.REVEAL) s.ready.delete(token)
  }

  // ---- player commands -----------------------------------------------------

  rename(token: PlayerToken, name: PlayerName): CommandResult {
    const player = this.seats.get(token)
    if (!player) return fail("unknown player")
    if (player.name === name) return OK_SAME
    player.name = name
    return OK_CHANGED
  }

  /** Use one of the game's hints on this round: one per round, so two bands never box the answer in. */
  hint(token: PlayerToken, axis: HintAxis): CommandResult {
    const seat = this.seats.get(token)
    if (!seat) return fail("unknown player")
    const s = this.state
    if (s.phase !== Phase.GUESSING) return fail("no round to hint")
    if (seat.role.type === Role.SPECTATOR || !playsRound(seat.role, s.round)) {
      return fail("you are not playing this round")
    }
    const { record } = seat.role
    if (s.hints.has(token)) return fail("one hint per round")
    if (record.hintsUsed >= this.config.hints) return fail("no hints left")
    s.hints.set(token, axis)
    record.hintsUsed++
    return OK_CHANGED
  }

  setPaint(token: PlayerToken, paint: PaintSubmission): CommandResult {
    const seat = this.seats.get(token)
    if (!seat) return fail("unknown player")
    if (seat.role.type === Role.SPECTATOR) return fail("you are watching")
    // Uploads are debounced on the client, so one can arrive just after the
    // round ended. It is stale rather than wrong: drop it quietly.
    const s = this.state
    if (s.phase !== Phase.GUESSING) return OK_SAME
    if (!playsRound(seat.role, s.round)) return fail("sitting this round out")
    // A stroke's upload can land just after the player locked in; it changes nothing.
    if (isLocked(s.submissions.get(token))) return OK_SAME
    s.submissions.set(token, { type: SubmissionType.DRAFT, paint })
    // Paint is private until the reveal, so other views do not change.
    return OK_SAME
  }

  /**
   * Freeze this player's guess. The round ends early once every active
   * player has. With nothing painted this is a pass: an empty submission
   * that scores PASS_SCORE, so a player with no idea need not hold
   * everyone up until the clock runs out.
   */
  lock(token: PlayerToken, now: Instant): CommandResult {
    const seat = this.seats.get(token)
    if (!seat) return fail("unknown player")
    // Pressed as the round ended, by this player or the clock: stale, not wrong.
    const s = this.state
    if (s.phase !== Phase.GUESSING) return OK_SAME
    if (seat.role.type === Role.SPECTATOR) return fail("you are watching")
    if (!playsRound(seat.role, s.round)) return fail("sitting this round out")
    const current = s.submissions.get(token)
    if (isLocked(current)) return OK_SAME
    s.submissions.set(token, {
      type: SubmissionType.LOCKED,
      paint: current?.paint ?? { cells: {}, floor: 1 },
      at: now
    })
    this.settleIfEveryoneDone(now)
    return OK_CHANGED
  }

  /**
   * Take back a Done (or a pass) to change the guess. Only while the round is
   * still running: once everyone is done it has already ended.
   */
  unlock(token: PlayerToken): CommandResult {
    const player = this.seats.get(token)
    if (!player) return fail("unknown player")
    const s = this.state
    if (s.phase !== Phase.GUESSING) return OK_SAME
    const current = s.submissions.get(token)
    if (current?.type !== SubmissionType.LOCKED) return OK_SAME
    s.submissions.set(token, { type: SubmissionType.DRAFT, paint: current.paint })
    return OK_CHANGED
  }

  /** Done reading the reveal. The next round starts once every connected player is. */
  ready(token: PlayerToken, now: Instant): CommandResult {
    const seat = this.seats.get(token)
    if (!seat) return fail("unknown player")
    // Pressed just after the last Ready moved the game on.
    const s = this.state
    if (s.phase !== Phase.REVEAL) return OK_SAME
    if (seat.role.type === Role.SPECTATOR) return fail("you are watching")
    if (s.ready.has(token)) return OK_SAME
    s.ready.add(token)
    this.settleIfEveryoneDone(now)
    return OK_CHANGED
  }

  /**
   * Both waiting phases end when everyone still here is done: guessing when
   * every connected active player has locked in, the reveal when every
   * connected player is ready. Nobody present means nothing happens; the
   * deadline (or the host) still governs.
   */
  private settleIfEveryoneDone(now: Instant): void {
    const s = this.state
    if (s.phase === Phase.GUESSING) {
      if (everyoneDone(this.lockingIn(s.round), (p) => isLocked(s.submissions.get(p.token))))
        this.state = this.closeRound(s)
    } else if (s.phase === Phase.REVEAL) {
      if (everyoneDone(this.present(), (p) => s.ready.has(p.token))) this.state = this.advance(s, now)
    }
  }

  /** The connected players who are playing this round. */
  private lockingIn(round: Round): PlayerSeat[] {
    return this.present().filter((p) => playsRound(p.role, round))
  }

  /** The connected players, leaving out spectators. */
  private present(): PlayerSeat[] {
    return this.seats.playing().filter((p) => p.connected)
  }

  // ---- clock ---------------------------------------------------------------

  /** Advance time-driven transitions. Returns true if the state changed. */
  tick(now: Instant): boolean {
    const s = this.state
    switch (s.phase) {
      case Phase.LOBBY:
        return this.seats.freeLapsed(now)
      case Phase.GUESSING:
        if (now < s.deadline + ROUND_GRACE) return false
        this.state = this.closeRound(s)
        return true
      case Phase.REVEAL:
      case Phase.RESULTS:
        return false
    }
  }

  /** Epoch time of the next time-driven transition, or undefined if none is pending. */
  nextWakeAt(): Instant | undefined {
    const s = this.state
    switch (s.phase) {
      case Phase.GUESSING:
        return s.deadline + ROUND_GRACE
      case Phase.LOBBY:
        return this.seats.nextLapseAt()
      case Phase.REVEAL:
      case Phase.RESULTS:
        return undefined
    }
  }

  // ---- transitions ---------------------------------------------------------

  private roundAt(index: number): Round | undefined {
    const question = this.questions[index]
    return question && { index, question }
  }

  private beginRound(round: Round, now: Instant): GuessingState {
    return {
      phase: Phase.GUESSING,
      round,
      deadline: now + this.config.roundLength,
      submissions: new Map(),
      hints: new Map()
    }
  }

  private closeRound(s: GuessingState): RevealState {
    const { round } = s
    const results = scorePlayers(this.seats.playing(), s, {
      outlines: this.bank.outlines,
      kernel: this.kernel,
      roundLength: this.config.roundLength
    })
    return {
      phase: Phase.REVEAL,
      round,
      reveal: revealOf(round.question, { index: round.index, total: this.questions.length }, results),
      lockedIn: new Set([...s.submissions].filter(([, sub]) => isLocked(sub)).map(([t]) => t)),
      hints: s.hints,
      ready: new Set()
    }
  }

  private advance(s: RevealState, now: Instant): GuessingState | ResultsState {
    const next = this.roundAt(s.round.index + 1)
    return next ? this.beginRound(next, now) : this.finish(s.round)
  }

  private finish(last: Round): ResultsState {
    const played = last.index + 1
    const playing = this.seats.playing()
    return {
      phase: Phase.RESULTS,
      standings: finalStandings(playing, played),
      awards: pickAwards(awardFacts(playing, played), this.seed),
      playedRounds: this.questions.slice(0, played).map(playedRound)
    }
  }

  // ---- views ---------------------------------------------------------------

  private youView(s: GameState, token: PlayerToken, me: Seat | undefined): YouView {
    const playing = me?.role.type === Role.PLAYER ? me.role : undefined
    return {
      id: me?.id,
      isHost: me !== undefined && this.seats.isHost(me.token),
      sittingOut:
        me !== undefined && (!playing || (s.phase !== Phase.LOBBY && playing.record.joinedRound >= joiningRound(s))),
      watching: me !== undefined && !playing,
      locked: lockedIn(s, token),
      hintsLeft: playing ? Math.max(0, this.config.hints - playing.record.hintsUsed) : 0,
      ...this.nextHostView(token)
    }
  }

  view(token: PlayerToken, now: Instant): GameView {
    const s = this.state
    const base = {
      code: this.code,
      config: this.config,
      serverTime: now,
      players: playerViews(this.seats.all(), this.seats.effectiveHost(), (t) => lockedIn(s, t))
    }
    const you = this.youView(s, token, this.seats.get(token))
    switch (s.phase) {
      case Phase.LOBBY:
        return { ...base, phase: Phase.LOBBY, you, ...upcomingOf(this.questions[0]) }
      case Phase.GUESSING: {
        const paint = s.submissions.get(token)?.paint
        return {
          ...base,
          phase: Phase.GUESSING,
          you: { ...you, ...this.hintView(s, token), ...(paint ? { paint } : {}) },
          round: roundView(s.round.question, s.round.index, this.questions.length, s.deadline),
          ...upcomingOf(this.questions[s.round.index + 1])
        }
      }
      case Phase.REVEAL:
        return {
          ...base,
          phase: Phase.REVEAL,
          you: { ...you, ...this.hintView(s, token) },
          reveal: { ...s.reveal, ready: this.readyIds(s.ready) },
          ...upcomingOf(this.questions[s.round.index + 1])
        }
      case Phase.RESULTS:
        return {
          ...base,
          phase: Phase.RESULTS,
          you,
          results: s.standings,
          playedRounds: s.playedRounds,
          awards: s.awards
        }
    }
  }

  /** This player's hint band on the round played or revealed. */
  private hintView(s: InPlayState, token: PlayerToken): { hint?: HintBand } {
    const axis = s.hints.get(token)
    return axis ? { hint: roundHintBand(s.round.question, this.seed, s.round.index, axis) } : {}
  }

  private readyIds(ready: ReadonlySet<PlayerToken>): PlayerId[] {
    return [...ready].flatMap((tok) => this.seats.get(tok)?.id ?? [])
  }

  /** This player's paint on the round being guessed, as last uploaded. */
  paintOf(token: PlayerToken): PaintSubmission | undefined {
    const s = this.state
    return s.phase === Phase.GUESSING ? s.submissions.get(token)?.paint : undefined
  }

  /** The reveal on show, the same object for as long as it shows. */
  get roundReveal(): RoundReveal | undefined {
    const s = this.state
    return s.phase === Phase.REVEAL ? s.reveal : undefined
  }

  /** For tests and diagnostics. */
  get playerTokens(): PlayerToken[] {
    return this.seats.tokens
  }
}
