/**
 * Pure multiplayer game state machine. No I/O, no timers: callers pass `now`
 * and poll `nextWakeAt()` to know when to call `tick`. Every mutator returns
 * whether anything changed so the transport layer can rebroadcast views.
 */
import { DEFAULT_KERNEL, kernelById, type Kernel } from "../scoring/scoring.ts"
import { resolutionForTolerance } from "../paint/paint.ts"
import type { Question } from "../questions.ts"
import { playedRound, questionPictures, revealOf, roundHintBand, roundView } from "./game-views.ts"
import { pickRounds, type QuestionBank } from "./round-picking.ts"
import { scoredAnswer } from "../scoring/regions.ts"
import { scoreRound, type Submission } from "../scoring/round-scoring.ts"
import { pickAwards, type Award } from "../awards/awards.ts"
import { DEFAULT_HINTS, type HintAxis, type HintBand } from "../hints.ts"
import type { PlayerId, PlayerName, PlayerToken, RoomCode } from "../ids.ts"
import { evenMix, MapDetail, Phase } from "../protocol.ts"
import type {
  ConfigurePatch,
  FinalStanding,
  GameConfig,
  GameView,
  PaintSubmission,
  QuestionPictures,
  RoundReveal,
  RoundResultView,
  YouView
} from "../protocol.ts"
import { CloseReason } from "../close-reason.ts"
import { OK_CHANGED, OK_SAME, fail, type CommandResult, type JoinResult } from "./command-result.ts"
import { Seats, freshRecord, type Player } from "./seats.ts"
import { awardFacts, finalStandings, playerViews, rankAmong } from "./standings.ts"
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

/** Plain data (settings, a mix) compared by value. */
function sameData(a: unknown, b: unknown): boolean {
  if (!(a instanceof Object) || !(b instanceof Object)) return a === b
  const x = a as Record<string, unknown>
  const y = b as Record<string, unknown>
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].every((k) => sameData(x[k], y[k]))
}

/** Someone to wait on, and nobody still to wait for. */
const everyoneDone = (waitingOn: Player[], done: (p: Player) => boolean): boolean =>
  waitingOn.length > 0 && waitingOn.every(done)

export class Game {
  readonly code: RoomCode
  config: GameConfig
  private readonly bank: QuestionBank
  private readonly kernel: Kernel

  phase: Phase = Phase.LOBBY
  private readonly seats = new Seats()

  private questions: Question[] = []
  private roundIndex = -1
  private deadline: Instant = 0
  private submissions = new Map<PlayerToken, Submission>()
  /** The hint each player used on the current round. */
  private hints = new Map<PlayerToken, HintAxis>()
  /** Tokens of players who have pressed Ready on the current reveal. */
  private ready_ = new Set<PlayerToken>()
  private reveal: RoundReveal | undefined = undefined
  private results: FinalStanding[] | undefined = undefined
  private awards: Award[] | undefined = undefined

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

  // ---- membership ----------------------------------------------------------

  /**
   * Join or reconnect. A known token reclaims its seat (and the host role, if
   * it was theirs) in whatever role it had. A newcomer plays unless they asked
   * to watch, or all MAX_PLAYERS seats are taken, in which case they watch if
   * there is room for another spectator.
   */
  join(token: PlayerToken, name: PlayerName, now: Instant, watch = false): JoinResult {
    if (this.seats.reconnect(token)) return OK_CHANGED
    if (this.seats.isBanned(token)) return { ok: false, reason: CloseReason.REMOVED }
    if (this.phase === Phase.RESULTS) return { ok: false, reason: CloseReason.FINISHED }
    return this.seats.admit(token, name, now, watch, this.joiningRound())
  }

  /** The first round index a player seated now may play. */
  private joiningRound(): number {
    return this.phase === Phase.LOBBY ? 0 : this.roundIndex + 1
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
    if (this.phase !== Phase.LOBBY) return fail("you can only leave from the lobby")
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
    if (this.phase !== Phase.LOBBY) return fail("game already started")
    if (this.seats.playing().length === 0) return fail("no players")
    for (const p of this.seats.all()) Object.assign(p, freshRecord(0))
    this.results = undefined
    this.beginRound(0, now)
    return OK_CHANGED
  }

  /** Host tunes the question mix (and so the rounds), round length and map detail while everyone is still in the lobby. */
  configure(token: PlayerToken, patch: ConfigurePatch): CommandResult {
    if (!this.seats.isHost(token)) return fail("only the host can change settings")
    if (this.phase !== Phase.LOBBY) return fail("settings are locked once the game starts")
    const next = { ...this.config, ...patch }
    if (sameData(next, this.config)) return OK_SAME
    this.config = next
    this.questions = pickRounds(this.bank, this.config, this.seed)
    return OK_CHANGED
  }

  /** Host advances from the reveal without waiting for the others. */
  next(token: PlayerToken, now: Instant): CommandResult {
    if (!this.seats.isHost(token)) return fail("only the host can advance")
    if (this.phase !== Phase.REVEAL) return fail("nothing to advance")
    this.advance(now)
    return OK_CHANGED
  }

  again(token: PlayerToken, now: Instant): CommandResult {
    if (!this.seats.isHost(token)) return fail("only the host can restart")
    if (this.phase !== Phase.RESULTS) return fail("game is still running")
    this.phase = Phase.LOBBY
    this.roundIndex = -1
    this.reveal = undefined
    this.results = undefined
    this.awards = undefined
    this.submissions.clear()
    this.ready_.clear()
    this.seed = now
    this.questions = pickRounds(this.bank, this.config, this.seed)
    for (const p of this.seats.all()) {
      Object.assign(p, freshRecord(0))
      // Back in a lobby, anyone away has its grace to come back, from now.
      if (!p.connected) p.leftAt = now
    }
    return OK_CHANGED
  }

  /**
   * Watch instead of playing (the colour is given up), in the lobby only, since
   * a player mid-game has scores. Or take a free seat: in the lobby, or
   * mid-game like a late joiner, sitting out the round under way and playing
   * from the next. Not on the final results; Play again starts a new lobby.
   */
  setRole(token: PlayerToken, watch: boolean): CommandResult {
    const player = this.seats.get(token)
    if (!player) return fail("unknown player")
    if (player.watching === watch) return OK_SAME
    if (watch && this.phase !== Phase.LOBBY) return fail("you can only switch to watching in the lobby")
    if (this.phase === Phase.RESULTS) return fail("game has finished")
    return this.seats.setWatching(player, watch, this.joiningRound())
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
    this.submissions.delete(target)
    this.ready_.delete(target)
    this.settleIfEveryoneDone(now)
    return OK_CHANGED
  }

  /** Stop after the current round: score it if it is still running, then show final standings. */
  end(token: PlayerToken): CommandResult {
    if (!this.seats.isHost(token)) return fail("only the host can end the game")
    if (this.phase === Phase.GUESSING) this.finishRound()
    else if (this.phase !== Phase.REVEAL) return fail("nothing to end")
    this.finish()
    return OK_CHANGED
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
    const player = this.seats.get(token)
    if (!player) return fail("unknown player")
    if (this.phase !== Phase.GUESSING) return fail("no round to hint")
    if (player.watching || player.joinedRound > this.roundIndex) return fail("you are not playing this round")
    if (this.hints.has(token)) return fail("one hint per round")
    if (player.hintsUsed >= this.config.hints) return fail("no hints left")
    this.hints.set(token, axis)
    player.hintsUsed++
    return OK_CHANGED
  }

  setPaint(token: PlayerToken, paint: PaintSubmission): CommandResult {
    const player = this.seats.get(token)
    if (!player) return fail("unknown player")
    if (player.watching) return fail("you are watching")
    // Uploads are debounced on the client, so one can arrive just after the
    // round ended. It is stale rather than wrong: drop it quietly.
    if (this.phase !== Phase.GUESSING) return OK_SAME
    if (player.joinedRound > this.roundIndex) return fail("sitting this round out")
    const current = this.submissions.get(token)
    // A stroke's upload can land just after the player locked in; it changes nothing.
    if (current?.locked) return OK_SAME
    this.submissions.set(token, { paint, locked: false })
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
    const player = this.seats.get(token)
    if (!player) return fail("unknown player")
    // Pressed as the round ended, by this player or the clock: stale, not wrong.
    if (this.phase !== Phase.GUESSING) return OK_SAME
    if (player.watching) return fail("you are watching")
    if (player.joinedRound > this.roundIndex) return fail("sitting this round out")
    let current = this.submissions.get(token)
    if (!current) {
      current = { paint: { cells: {}, floor: 1 }, locked: false }
      this.submissions.set(token, current)
    }
    if (current.locked) return OK_SAME
    current.locked = true
    current.lockedAt = now
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
    if (this.phase !== Phase.GUESSING) return OK_SAME
    const current = this.submissions.get(token)
    if (!current?.locked) return OK_SAME
    current.locked = false
    return OK_CHANGED
  }

  /** Done reading the reveal. The next round starts once every connected player is. */
  ready(token: PlayerToken, now: Instant): CommandResult {
    const player = this.seats.get(token)
    if (!player) return fail("unknown player")
    // Pressed just after the last Ready moved the game on.
    if (this.phase !== Phase.REVEAL) return OK_SAME
    if (player.watching) return fail("you are watching")
    if (this.ready_.has(token)) return OK_SAME
    this.ready_.add(token)
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
    if (this.phase === Phase.GUESSING) {
      if (everyoneDone(this.lockingIn(), (p) => this.submissions.get(p.token)?.locked === true)) this.finishRound()
    } else if (this.phase === Phase.REVEAL) {
      if (everyoneDone(this.present(), (p) => this.ready_.has(p.token))) this.advance(now)
    }
  }

  /** The connected players who are playing this round. */
  private lockingIn(): Player[] {
    return this.present().filter((p) => p.joinedRound <= this.roundIndex)
  }

  /** The connected players, leaving out spectators. */
  private present(): Player[] {
    return this.seats.playing().filter((p) => p.connected)
  }

  // ---- clock ---------------------------------------------------------------

  /** Advance time-driven transitions. Returns true if the state changed. */
  tick(now: Instant): boolean {
    if (this.phase === Phase.LOBBY) return this.seats.freeLapsed(now)
    if (this.phase === Phase.GUESSING && now >= this.deadline + ROUND_GRACE) {
      this.finishRound()
      return true
    }
    return false
  }

  /** Epoch time of the next time-driven transition, or undefined if none is pending. */
  nextWakeAt(): Instant | undefined {
    if (this.phase === Phase.GUESSING) return this.deadline + ROUND_GRACE
    if (this.phase === Phase.LOBBY) return this.seats.nextLapseAt()
    return undefined
  }

  // ---- transitions ---------------------------------------------------------

  private beginRound(index: number, now: Instant): void {
    this.roundIndex = index
    this.phase = Phase.GUESSING
    this.deadline = now + this.config.roundLength
    this.submissions.clear()
    this.hints.clear()
    this.ready_.clear()
    this.reveal = undefined
  }

  private finishRound(): void {
    const q = this.questions[this.roundIndex]!
    const answer = scoredAnswer(q.answer, this.bank.outlines)
    const res = resolutionForTolerance(answer.tolerance)
    const results: RoundResultView[] = []
    // Snapshot ranks before any score changes so arrows compare like with like.
    const playing = this.seats.playing()
    for (const p of playing) p.previousRank = rankAmong(p, playing)
    const { roundLength } = this.config
    const timing = { startedAt: this.deadline - roundLength, roundLength }
    for (const p of playing) {
      if (p.joinedRound > this.roundIndex) continue
      const { score, parts, facts, paint } = scoreRound(
        q.label,
        answer,
        this.submissions.get(p.token),
        this.kernel,
        timing
      )
      p.scores[this.roundIndex] = score
      p.facts[this.roundIndex] = facts
      const hint = this.hints.get(p.token)
      results.push({ playerId: p.id, score, parts, paint, res, ...(hint ? { hint } : {}) })
    }
    results.sort((a, b) => b.score - a.score)
    this.phase = Phase.REVEAL
    this.reveal = revealOf(q, { index: this.roundIndex, total: this.questions.length }, results)
  }

  private advance(now: Instant): void {
    if (this.roundIndex + 1 < this.questions.length) {
      this.beginRound(this.roundIndex + 1, now)
      return
    }
    this.finish()
  }

  private finish(): void {
    this.phase = Phase.RESULTS
    this.reveal = undefined
    const playing = this.seats.playing()
    this.results = finalStandings(playing, this.roundIndex + 1)
    this.awards = pickAwards(awardFacts(playing, this.roundIndex + 1), this.seed)
  }

  // ---- views ---------------------------------------------------------------

  view(token: PlayerToken, now: Instant): GameView {
    const me = this.seats.get(token)
    const base = {
      code: this.code,
      config: this.config,
      serverTime: now,
      players: playerViews(
        this.seats.all(),
        this.seats.effectiveHost(),
        (t) => this.submissions.get(t)?.locked ?? false
      )
    }
    const you: YouView = {
      id: me?.id,
      isHost: me !== undefined && this.seats.isHost(me.token),
      sittingOut: me !== undefined && (me.watching || (this.phase !== Phase.LOBBY && me.joinedRound > this.roundIndex)),
      watching: me?.watching ?? false,
      locked: this.submissions.get(token)?.locked ?? false,
      hintsLeft: me && !me.watching ? Math.max(0, this.config.hints - me.hintsUsed) : 0,
      ...this.nextHostView(token)
    }
    switch (this.phase) {
      case Phase.LOBBY:
        return { ...base, phase: Phase.LOBBY, you, ...this.upcoming() }
      case Phase.GUESSING: {
        const q = this.questions[this.roundIndex]!
        const paint = this.paintOf(token)
        return {
          ...base,
          phase: Phase.GUESSING,
          you: { ...you, ...this.hintView(token), ...(paint ? { paint } : {}) },
          round: roundView(q, this.roundIndex, this.questions.length, this.deadline),
          ...this.upcoming()
        }
      }
      case Phase.REVEAL:
        return {
          ...base,
          phase: Phase.REVEAL,
          you: { ...you, ...this.hintView(token) },
          reveal: { ...this.reveal!, ready: this.readyIds() },
          ...this.upcoming()
        }
      case Phase.RESULTS:
        return {
          ...base,
          phase: Phase.RESULTS,
          you,
          results: this.results!,
          playedRounds: this.questions.slice(0, this.roundIndex + 1).map(playedRound),
          awards: this.awards!
        }
    }
  }

  /** This player's hint band on the round played or revealed. */
  private hintView(token: PlayerToken): { hint?: HintBand } {
    const axis = this.hints.get(token)
    const q = this.questions[this.roundIndex]
    return axis && q ? { hint: roundHintBand(q, this.seed, this.roundIndex, axis) } : {}
  }

  /** The next round's pictures: round 1's in the lobby, the following round's while one is played or revealed. */
  private upcoming(): { upcoming?: QuestionPictures } {
    const q = this.questions[this.phase === Phase.LOBBY ? 0 : this.roundIndex + 1]
    if (!q) return {}
    const pictures = questionPictures(q)
    return Object.keys(pictures).length > 0 ? { upcoming: pictures } : {}
  }

  private readyIds(): PlayerId[] {
    return [...this.ready_].flatMap((tok) => this.seats.get(tok)?.id ?? [])
  }

  /** This player's paint on the round being guessed, as last uploaded. */
  paintOf(token: PlayerToken): PaintSubmission | undefined {
    return this.phase === Phase.GUESSING ? this.submissions.get(token)?.paint : undefined
  }

  /** The reveal on show, the same object for as long as it shows. */
  get roundReveal(): RoundReveal | undefined {
    return this.phase === Phase.REVEAL ? this.reveal : undefined
  }

  /** For tests and diagnostics. */
  get playerTokens(): PlayerToken[] {
    return this.seats.tokens
  }
}
