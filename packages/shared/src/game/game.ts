/**
 * Pure multiplayer game state machine. No I/O, no timers: callers pass `now`
 * and poll `nextWakeAt()` to know when to call `tick`. Every mutator returns
 * whether anything changed so the transport layer can rebroadcast views.
 */
import { DEFAULT_KERNEL, kernelById, type Kernel } from "../scoring/scoring.ts"
import type { Question } from "../questions.ts"
import { playerView } from "./player-view.ts"
import { playedRound, revealOf } from "./question-views.ts"
import { pickRounds, type QuestionBank } from "./round-picking.ts"
import { scorePaint, scorePlayers, type ScoringContext } from "./round-results.ts"
import { SubmissionType } from "../scoring/round-scoring.ts"
import { pickAwards } from "../awards/awards.ts"
import { DEFAULT_HINTS, type HintAxis } from "../hints.ts"
import type { PlayerId, PlayerName, PlayerToken, RoomCode } from "../ids.ts"
import { evenMix, MapDetail, type ConfigurePatch, type GameConfig } from "../protocol/config.ts"
import { Phase, RoundGuessType, type GameView, type PaintSubmission, type RoundReveal } from "../protocol/views.ts"
import type { GameSnapshot, RevealTally } from "./milestones.ts"
import { CloseReason } from "../close-reason.ts"
import { OK_CHANGED, OK_SAME, fail, type CommandResult, type JoinResult } from "./command-result.ts"
import { sameData } from "./same-data.ts"
import { Seats, freshRecord, isPlayer, type PlayerSeat } from "./seats.ts"
import { Role } from "../roles.ts"
import { awardFacts, finalStandings } from "./standings.ts"
import {
  isLocked,
  joiningRound,
  LOBBY_STATE,
  playsRound,
  type GameState,
  type GuessingState,
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
const everyoneDone = (waitingOn: PlayerSeat[], done: (seat: PlayerSeat) => boolean): boolean =>
  waitingOn.length > 0 && waitingOn.every(done)

export class Game {
  readonly code: RoomCode
  config: GameConfig
  private readonly bank: QuestionBank
  private readonly kernel: Kernel

  private state: GameState = LOBBY_STATE
  private readonly seats = new Seats()

  private questions: readonly Question[] = []
  private readonly given: readonly Question[] | undefined

  private seed: number

  constructor(
    code: RoomCode,
    bank: QuestionBank,
    {
      config = {},
      seed = Date.now(),
      questions
    }: { config?: Partial<GameConfig>; seed?: number; questions?: readonly Question[] } = {}
  ) {
    this.seed = seed
    this.code = code
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.bank = bank
    this.kernel = kernelById(this.config.kernelId)
    if (bank.catalogue.length === 0) throw new Error("question catalogue is empty")
    this.given = questions
    this.questions = this.pickQuestions()
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
    for (const seat of this.seats.playing()) seat.role.record = freshRecord(0)
    this.state = this.beginRound(first, now)
    return OK_CHANGED
  }

  /** The questions given at construction, else a pick from the bank for the config and seed. */
  private pickQuestions(): readonly Question[] {
    return this.given ?? pickRounds(this.bank, this.config, this.seed)
  }

  /** Host tunes the question mix (and so the rounds), round length and map detail while everyone is still in the lobby. */
  configure(token: PlayerToken, patch: ConfigurePatch): CommandResult {
    if (!this.seats.isHost(token)) return fail("only the host can change settings")
    if (this.state.phase !== Phase.LOBBY) return fail("settings are locked once the game starts")
    const next = { ...this.config, ...patch }
    if (sameData(next, this.config)) return OK_SAME
    this.config = next
    this.questions = this.pickQuestions()
    return OK_CHANGED
  }

  /** Host advances from the reveal without waiting for the others. */
  next(token: PlayerToken, now: Instant): CommandResult {
    if (!this.seats.isHost(token)) return fail("only the host can advance")
    const state = this.state
    if (state.phase !== Phase.REVEAL) return fail("nothing to advance")
    this.state = this.advance(state, now)
    return OK_CHANGED
  }

  again(token: PlayerToken, now: Instant): CommandResult {
    if (!this.seats.isHost(token)) return fail("only the host can restart")
    if (this.state.phase !== Phase.RESULTS) return fail("game is still running")
    this.state = LOBBY_STATE
    this.seed = now
    this.questions = this.pickQuestions()
    for (const seat of this.seats.playing()) seat.role.record = freshRecord(0)
    // Back in a lobby, anyone away has its grace to come back, from now.
    for (const seat of this.seats.all()) if (!seat.connected) seat.leftAt = now
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
   * an absent host, in which case the role passes on. Not on the final
   * results, which are the finished game's record: Play again opens a lobby
   * where anyone can be removed.
   */
  kick(token: PlayerToken, playerId: PlayerId, now: Instant): CommandResult {
    if (!this.seats.isHost(token)) return fail("only the host can remove players")
    if (this.state.phase === Phase.RESULTS) return fail("game has finished")
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
    const state = this.state
    if (state.phase === Phase.GUESSING) this.state = this.finish(this.closeRound(state).round)
    else if (state.phase === Phase.REVEAL) this.state = this.finish(state.round)
    else return fail("nothing to end")
    return OK_CHANGED
  }

  /** Drop what a removed player had in the phase under way. */
  private forget(token: PlayerToken): void {
    const state = this.state
    if (state.phase === Phase.GUESSING) state.submissions.delete(token)
    else if (state.phase === Phase.REVEAL) state.ready.delete(token)
  }

  // ---- player commands -----------------------------------------------------

  rename(token: PlayerToken, name: PlayerName): CommandResult {
    const player = this.seats.get(token)
    if (!player) return fail("unknown player")
    if (player.name === name) return OK_SAME
    player.name = name
    return OK_CHANGED
  }

  /** Use one of the game'state hints on this round: one per round, so two bands never box the answer in. */
  hint(token: PlayerToken, axis: HintAxis): CommandResult {
    const seat = this.seats.get(token)
    if (!seat) return fail("unknown player")
    const state = this.state
    if (state.phase !== Phase.GUESSING) return fail("no round to hint")
    if (seat.role.type === Role.SPECTATOR || !playsRound(seat.role, state.round)) {
      return fail("you are not playing this round")
    }
    const { record } = seat.role
    if (state.hints.has(token)) return fail("one hint per round")
    if (this.config.hints !== undefined && record.hintsUsed >= this.config.hints) return fail("no hints left")
    state.hints.set(token, axis)
    record.hintsUsed++
    return OK_CHANGED
  }

  setPaint(token: PlayerToken, paint: PaintSubmission): CommandResult {
    const seat = this.seats.get(token)
    if (!seat) return fail("unknown player")
    if (seat.role.type === Role.SPECTATOR) return fail("you are watching")
    // Uploads are debounced on the client, so one can arrive just after the
    // round ended. It is stale rather than wrong: drop it quietly.
    const state = this.state
    if (state.phase !== Phase.GUESSING) return OK_SAME
    if (!playsRound(seat.role, state.round)) return fail("sitting this round out")
    // A stroke'state upload can land just after the player locked in; it changes nothing.
    if (isLocked(state.submissions.get(token))) return OK_SAME
    state.submissions.set(token, { type: SubmissionType.DRAFT, paint })
    // Paint is private until the reveal, so other views do not change.
    return OK_SAME
  }

  /**
   * Freeze this player'state guess. The round ends early once every active
   * player has. With nothing painted this is a pass: an empty submission
   * that scores PASS_SCORE, so a player with no idea need not hold
   * everyone up until the clock runs out.
   */
  lock(token: PlayerToken, now: Instant): CommandResult {
    const seat = this.seats.get(token)
    if (!seat) return fail("unknown player")
    // Pressed as the round ended, by this player or the clock: stale, not wrong.
    const state = this.state
    if (state.phase !== Phase.GUESSING) return OK_SAME
    if (seat.role.type === Role.SPECTATOR) return fail("you are watching")
    if (!playsRound(seat.role, state.round)) return fail("sitting this round out")
    const current = state.submissions.get(token)
    if (isLocked(current)) return OK_SAME
    const paint = current?.paint ?? { cells: {}, floor: 1 }
    state.submissions.set(token, {
      type: SubmissionType.LOCKED,
      paint,
      at: now,
      scored: scorePaint(state.round.question, state.startedAt, paint, now, this.scoringContext())
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
    const state = this.state
    if (state.phase !== Phase.GUESSING) return OK_SAME
    const current = state.submissions.get(token)
    if (current?.type !== SubmissionType.LOCKED) return OK_SAME
    state.submissions.set(token, { type: SubmissionType.DRAFT, paint: current.paint })
    return OK_CHANGED
  }

  /** Done reading the reveal. The next round starts once every connected player is. */
  ready(token: PlayerToken, now: Instant): CommandResult {
    const seat = this.seats.get(token)
    if (!seat) return fail("unknown player")
    // Pressed just after the last Ready moved the game on.
    const state = this.state
    if (state.phase !== Phase.REVEAL) return OK_SAME
    if (seat.role.type === Role.SPECTATOR) return fail("you are watching")
    if (state.ready.has(token)) return OK_SAME
    state.ready.add(token)
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
    const state = this.state
    if (state.phase === Phase.GUESSING) {
      if (everyoneDone(this.lockingIn(state.round), (seat) => isLocked(state.submissions.get(seat.token))))
        this.state = this.closeRound(state)
    } else if (state.phase === Phase.REVEAL) {
      if (everyoneDone(this.present(), (seat) => state.ready.has(seat.token))) this.state = this.advance(state, now)
    }
  }

  /** The connected players who are playing this round. */
  private lockingIn(round: Round): PlayerSeat[] {
    return this.present().filter((seat) => playsRound(seat.role, round))
  }

  /** The connected players, leaving out spectators. */
  private present(): PlayerSeat[] {
    return this.seats.playing().filter((seat) => seat.connected)
  }

  // ---- clock ---------------------------------------------------------------

  /** Advance time-driven transitions. Returns true if the state changed. */
  tick(now: Instant): boolean {
    const state = this.state
    switch (state.phase) {
      case Phase.LOBBY:
        return this.seats.freeLapsed(now)
      case Phase.GUESSING:
        if (state.deadline === undefined || now < state.deadline + ROUND_GRACE) return false
        this.state = this.closeRound(state)
        return true
      case Phase.REVEAL:
      case Phase.RESULTS:
        return false
    }
  }

  /** Epoch time of the next time-driven transition, or undefined if none is pending. */
  nextWakeAt(): Instant | undefined {
    const state = this.state
    switch (state.phase) {
      case Phase.GUESSING:
        return state.deadline === undefined ? undefined : state.deadline + ROUND_GRACE
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
      startedAt: now,
      deadline: this.config.roundLength === undefined ? undefined : now + this.config.roundLength,
      submissions: new Map(),
      hints: new Map()
    }
  }

  private scoringContext(): ScoringContext {
    return { outlines: this.bank.outlines, kernel: this.kernel, roundLength: this.config.roundLength }
  }

  private closeRound(state: GuessingState): RevealState {
    const { round } = state
    const results = scorePlayers(this.seats.playing(), state, this.scoringContext())
    return {
      phase: Phase.REVEAL,
      round,
      reveal: revealOf(round.question, { index: round.index, total: this.questions.length }, results),
      lockedIn: new Set([...state.submissions].flatMap(([token, submission]) => (isLocked(submission) ? [token] : []))),
      hints: state.hints,
      ready: new Set()
    }
  }

  private advance(state: RevealState, now: Instant): GuessingState | ResultsState {
    const next = this.roundAt(state.round.index + 1)
    return next ? this.beginRound(next, now) : this.finish(state.round)
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

  /** A view for a seated token; undefined for one with no seat (removed, left, or turned away). */
  view(token: PlayerToken, now: Instant): GameView | undefined {
    const { code, config, seed, questions } = this
    return playerView({ code, config, seed, questions }, this.seats, this.state, token, now)
  }

  /** This player's paint on the round being guessed, as last uploaded. */
  paintOf(token: PlayerToken): PaintSubmission | undefined {
    const state = this.state
    return state.phase === Phase.GUESSING ? state.submissions.get(token)?.paint : undefined
  }

  /** The question being guessed, with its answer: for the server's own use, never sent to players. */
  get questionBeingGuessed(): Question | undefined {
    const state = this.state
    return state.phase === Phase.GUESSING ? state.round.question : undefined
  }

  /** The reveal on show, the same object for as long as it shows. */
  get roundReveal(): RoundReveal | undefined {
    const state = this.state
    return state.phase === Phase.REVEAL ? state.reveal : undefined
  }

  /** Who a seated token is, for the server's logs. */
  identify(token: PlayerToken): { id: PlayerId; role: Role } | undefined {
    const seat = this.seats.get(token)
    return seat && { id: seat.id, role: seat.role.type }
  }

  /** Who is connected, for the server's gauges. */
  get connectedCounts(): { players: number; spectators: number } {
    const connected = this.seats.all().filter((seat) => seat.connected)
    const players = connected.filter(isPlayer).length
    return { players, spectators: connected.length - players }
  }

  /** Where the game has got to, to compare with an earlier look (see milestones). */
  snapshot(): GameSnapshot {
    const state = this.state
    const inPlay = state.phase === Phase.GUESSING || state.phase === Phase.REVEAL
    return {
      phase: state.phase,
      roundIndex: inPlay ? state.round.index : undefined,
      question: inPlay ? { id: state.round.question.id, type: state.round.question.type } : undefined,
      tally: state.phase === Phase.REVEAL ? this.tallyOf(state) : undefined,
      roundsPlayed: state.phase === Phase.RESULTS ? state.playedRounds.length : undefined,
      totalRounds: this.questions.length,
      playerCount: this.seats.playing().length,
      mix: this.config.mix
    }
  }

  private tallyOf(state: RevealState): RevealTally {
    const tally = { painted: 0, passed: 0, missing: 0 }
    for (const { playerId, guess } of state.reveal.results) {
      if (guess.type === RoundGuessType.PAINTED) tally.painted++
      else if (this.isLockedIn(state, playerId)) tally.passed++
      else tally.missing++
    }
    return tally
  }

  private isLockedIn(state: RevealState, id: PlayerId): boolean {
    const token = this.tokenOf(id)
    return token !== undefined && state.lockedIn.has(token)
  }

  /** For tests and diagnostics. */
  get playerTokens(): PlayerToken[] {
    return this.seats.tokens
  }
}
