/**
 * Pure multiplayer game state machine. No I/O, no timers: callers pass `now`
 * and poll `nextWakeAt()` to know when to call `tick`. Every mutator returns
 * whether anything changed so the transport layer can rebroadcast views.
 */
import { DEFAULT_KERNEL, buildDistribution, kernelById, type Kernel } from "./scoring.ts"
import { PaintLayer, resolutionForTolerance } from "./paint.ts"
import { pickQuestions, shuffle, type Question } from "./questions.ts"
import { regionFit, regionMisfit, roundsOverlap, scoreAnswer, type RegionQuestion } from "./regions.ts"
import { explainPoint, isHedge } from "./explain.ts"
import { pickAwards, type Award, type RoundFacts } from "./awards.ts"
import { flagRound, type FlagQuestion } from "./flags.ts"
import { revealPhoto } from "./photos.ts"
import { DEFAULT_HINTS, hintBand, seededUnit, type HintAxis, type HintBand } from "./hints.ts"
import { playerColour, type PlayerColour } from "./colours.ts"
import { playerId, roomCode, type PlayerId, type PlayerName, type PlayerToken, type RoomCode } from "./ids.ts"
import {
  MAX_PLAYERS,
  MAX_SPECTATORS,
  QUESTION_TYPES,
  SEAT_GRACE_MS,
  evenMix,
  mixTotal,
  showsLakes
} from "./protocol.ts"
import type {
  ConfigurePatch,
  FinalStanding,
  GameConfig,
  GameView,
  PaintSubmission,
  Phase,
  PlayedRound,
  PlayerView,
  QuestionPictures,
  QuestionType,
  QuestionView,
  RoundReveal,
  RoundResultView
} from "./protocol.ts"

export const DEFAULT_CONFIG: GameConfig = {
  rounds: 8,
  roundMs: 60_000,
  mix: evenMix(8),
  mapDetail: "minimal",
  kernelId: DEFAULT_KERNEL.id,
  hints: DEFAULT_HINTS
}

/**
 * How long after the deadline a round is scored. Clients stop painting at
 * zero and send what they have; this lets that paint arrive.
 */
export const ROUND_GRACE_MS = 1000

interface Player {
  id: PlayerId
  token: PlayerToken
  name: PlayerName
  /** Unset while watching. */
  colour: PlayerColour | undefined
  /** A spectator: sees every round, plays none, and is never waited on. */
  watching: boolean
  connected: boolean
  /** When the connection dropped, while it is down. */
  leftAt: number | undefined
  joinedAt: number
  /** First round index this player may play. Later joiners sit out the current one. */
  joinedRound: number
  /** By round index; a hole for each round not played. */
  scores: (number | undefined)[]
  /** By round index, for the awards; a hole for each round not played. */
  facts: (RoundFacts | undefined)[]
  previousRank: number | undefined
  hintsUsed: number
}

interface Submission {
  paint: PaintSubmission
  locked: boolean
  /** When the player last locked in. */
  lockedAt?: number
}

export type CommandResult = { ok: true; changed: boolean } | { ok: false; error: string }

const OK_CHANGED: CommandResult = { ok: true, changed: true }
const OK_SAME: CommandResult = { ok: true, changed: false }
const fail = (error: string): CommandResult => ({ ok: false, error })

export class Game {
  readonly code: RoomCode
  config: GameConfig
  private readonly pool: Question[]
  /** Countries for "Paint the whole of …" rounds; the server passes regions.json. */
  private readonly regions: RegionQuestion[]
  /** Flag rounds, from flags.json and the countries: each a region or a point question. */
  private readonly flagRounds: (Question | RegionQuestion)[]
  /** Islands, lakes, seas and US states; the server passes features.json. */
  private readonly features: (Question | RegionQuestion)[]
  private readonly kernel: Kernel

  phase: Phase = "lobby"
  private players = new Map<PlayerToken, Player>()
  private hostToken: PlayerToken | undefined = undefined
  private nextPlayerId = 1

  private questions: (Question | RegionQuestion)[] = []
  private roundIndex = -1
  private deadline = 0
  private submissions = new Map<PlayerToken, Submission>()
  /** The hint each player used on the current round. */
  private hints = new Map<PlayerToken, HintAxis>()
  /** Tokens of players who have pressed Ready on the current reveal. */
  private ready_ = new Set<PlayerToken>()
  private reveal: RoundReveal | undefined = undefined
  private results: FinalStanding[] | undefined = undefined
  private awards: Award[] | undefined = undefined
  /** Tokens the host has removed; they may not reclaim a seat. */
  private kicked = new Set<PlayerToken>()

  private seed: number

  constructor(
    code: RoomCode,
    pool: Question[],
    config: Partial<GameConfig> = {},
    seed = Date.now(),
    regions: RegionQuestion[] = [],
    flags: FlagQuestion[] = [],
    features: (Question | RegionQuestion)[] = []
  ) {
    this.seed = seed
    this.code = code
    // A mix sets the rounds; a length alone (ROUNDS on the server, tests) is an even mix of that length.
    const mix = config.mix ?? (config.rounds !== undefined ? evenMix(config.rounds) : DEFAULT_CONFIG.mix)
    this.config = { ...DEFAULT_CONFIG, ...config, mix, rounds: mixTotal(mix) }
    this.pool = pool
    this.regions = regions
    const byId = new Map(regions.map((q) => [q.id, q]))
    this.flagRounds = flags.flatMap((f) => flagRound(f, byId) ?? [])
    this.features = features
    this.kernel = kernelById(this.config.kernelId)
    if (pool.length === 0) throw new Error("question pool is empty")
    this.questions = this.pickRounds()
  }

  // ---- membership ----------------------------------------------------------

  /** The lowest colour no current player has, so a removed player's colour is reused. */
  private freeColour(): PlayerColour {
    const used = new Set<number | undefined>(this.playing().map((p) => p.colour))
    let colour = 0
    while (used.has(colour)) colour++
    return playerColour(colour)
  }

  /** The players, leaving out spectators. */
  private playing(): Player[] {
    return [...this.players.values()].filter((p) => !p.watching)
  }

  private watcherCount(): number {
    return this.players.size - this.playing().length
  }

  /**
   * Join or reconnect. A known token reclaims its seat (and the host role, if
   * it was theirs) in whatever role it had. A newcomer plays unless they asked
   * to watch, or all MAX_PLAYERS seats are taken, in which case they watch if
   * there is room for another spectator.
   */
  join(token: PlayerToken, name: PlayerName, now: number, watch = false): CommandResult {
    const existing = this.players.get(token)
    if (existing) {
      existing.connected = true
      existing.leftAt = undefined
      this.hostToken ??= token
      return OK_CHANGED
    }
    if (this.kicked.has(token)) return fail("removed by the host")
    if (this.phase === "results") return fail("game has finished")
    const seatFree = this.playing().length < MAX_PLAYERS
    const roomToWatch = this.watcherCount() < MAX_SPECTATORS
    let watching: boolean
    if (!watch && seatFree) watching = false
    else if (roomToWatch) watching = true
    else return fail(seatFree ? "no room to watch" : "game is full")
    const player: Player = {
      id: playerId(`p${this.nextPlayerId++}`),
      token,
      name,
      colour: watching ? undefined : this.freeColour(),
      watching,
      connected: true,
      leftAt: undefined,
      joinedAt: now,
      joinedRound: this.phase === "lobby" ? 0 : this.roundIndex + 1,
      scores: [],
      facts: [],
      previousRank: undefined,
      hintsUsed: 0
    }
    this.players.set(token, player)
    this.hostToken ??= token
    return OK_CHANGED
  }

  /**
   * Connection dropped. The seat is held, so a refresh takes it back: in the
   * lobby for SEAT_GRACE_MS (then tick frees it), mid-game for good. The
   * host keeps the role while away; the longest-standing connected player
   * acts as host in the meantime.
   */
  disconnect(token: PlayerToken, now: number): CommandResult {
    const player = this.players.get(token)
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
    if (!this.players.has(token)) return fail("unknown player")
    if (this.phase !== "lobby") return fail("you can only leave from the lobby")
    this.players.delete(token)
    if (this.hostToken === token) this.hostToken = this.pickHost()
    return OK_CHANGED
  }

  private pickHost(): PlayerToken | undefined {
    let best: Player | undefined = undefined
    for (const p of this.players.values()) {
      if (!p.connected) continue
      if (!best || p.joinedAt < best.joinedAt) best = p
    }
    return best?.token
  }

  /** Who may use the host controls right now: the host if connected, else the acting host. */
  private effectiveHost(): PlayerToken | undefined {
    const host = this.hostToken ? this.players.get(this.hostToken) : undefined
    if (host?.connected) return host.token
    return this.pickHost() ?? this.hostToken
  }

  private isHost(token: PlayerToken): boolean {
    return this.effectiveHost() === token
  }

  get playerCount(): number {
    return this.players.size
  }

  get connectedCount(): number {
    let n = 0
    for (const p of this.players.values()) if (p.connected) n++
    return n
  }

  // ---- host commands -------------------------------------------------------

  start(token: PlayerToken, now: number): CommandResult {
    if (!this.isHost(token)) return fail("only the host can start")
    if (this.phase !== "lobby") return fail("game already started")
    if (this.playing().length === 0) return fail("no players")
    for (const p of this.players.values()) {
      p.scores = []
      p.facts = []
      p.previousRank = undefined
      p.joinedRound = 0
      p.hintsUsed = 0
    }
    this.results = undefined
    this.beginRound(0, now)
    return OK_CHANGED
  }

  /**
   * The rounds' questions, as many of each kind as the mix asks while they
   * last, in a shuffled order. Landmarks and place names come from the pool
   * through pickQuestions (so a game of only those is exactly what it picks);
   * the rest from their own lists, never a country already asked another way
   * ("Where is Monaco?" and Monaco's flag, say), and where the lists allow,
   * none overlapping a round already chosen. Lakes only on a map that shows
   * them.
   */
  private pickRounds(): (Question | RegionQuestion)[] {
    const { landmarks, places, countries, flags, features, states } = this.config.mix
    const named = landmarks + places
    const picked = pickQuestions(this.pool, named, this.seed, named > 0 ? landmarks / named : 0.5)
    if (countries + flags + features + states === 0) return picked
    const asked = new Set(picked.map((q) => q.label))
    const fresh = (q: Question | RegionQuestion) => !asked.has(q.id) && !asked.has(q.label)
    const chosen: (Question | RegionQuestion)[] = [...picked]
    const take = (from: (Question | RegionQuestion)[], salt: number, count: number) => {
      const candidates = shuffle(from, this.seed ^ salt).filter(fresh)
      const out: (Question | RegionQuestion)[] = []
      while (out.length < count && candidates.length > 0) {
        const apart = candidates.findIndex((q) => !chosen.some((c) => roundsOverlap(c, q)))
        const q = candidates.splice(Math.max(apart, 0), 1)[0]!
        out.push(q)
        chosen.push(q)
        asked.add(q.id).add(q.label)
      }
      return out
    }
    const lakes = showsLakes(this.config.mapDetail)
    return shuffle<Question | RegionQuestion>(
      [
        ...picked,
        ...take(this.regions, 0x2545f491, countries),
        ...take(this.flagRounds, 0x68e31da4, flags),
        ...take(
          this.features.filter((q) => q.topic !== "state" && (lakes || q.topic !== "lake")),
          0x1b873593,
          features
        ),
        ...take(
          this.features.filter((q) => q.topic === "state"),
          0x85ebca6b,
          states
        )
      ],
      this.seed ^ 0x5bd1e995
    )
  }

  /** Host tunes the question mix (and so the rounds), round length and map detail while everyone is still in the lobby. */
  configure(token: PlayerToken, patch: ConfigurePatch): CommandResult {
    if (!this.isHost(token)) return fail("only the host can change settings")
    if (this.phase !== "lobby") return fail("settings are locked once the game starts")
    const mix = patch.mix ?? this.config.mix
    const next = { ...this.config, ...patch, mix, rounds: mixTotal(mix) }
    if (
      next.roundMs === this.config.roundMs &&
      next.mapDetail === this.config.mapDetail &&
      next.hints === this.config.hints &&
      QUESTION_TYPES.every((t) => mix[t.id] === this.config.mix[t.id])
    )
      return OK_SAME
    this.config = next
    this.questions = this.pickRounds()
    return OK_CHANGED
  }

  /** Host advances from the reveal without waiting for the others. */
  next(token: PlayerToken, now: number): CommandResult {
    if (!this.isHost(token)) return fail("only the host can advance")
    if (this.phase !== "reveal") return fail("nothing to advance")
    this.advance(now)
    return OK_CHANGED
  }

  again(token: PlayerToken, now: number): CommandResult {
    if (!this.isHost(token)) return fail("only the host can restart")
    if (this.phase !== "results") return fail("game is still running")
    this.phase = "lobby"
    this.roundIndex = -1
    this.reveal = undefined
    this.results = undefined
    this.awards = undefined
    this.submissions.clear()
    this.ready_.clear()
    this.seed = now
    this.questions = this.pickRounds()
    for (const p of this.players.values()) {
      p.scores = []
      p.previousRank = undefined
      p.joinedRound = 0
      p.hintsUsed = 0
    }
    for (const [tok, p] of this.players) if (!p.connected) this.players.delete(tok)
    if (this.hostToken === undefined || !this.players.has(this.hostToken)) this.hostToken = this.pickHost()
    return OK_CHANGED
  }

  /**
   * Watch instead of playing (the colour is given up), in the lobby only, since
   * a player mid-game has scores. Or take a free seat: in the lobby, or
   * mid-game like a late joiner, sitting out the round under way and playing
   * from the next. Not on the final results; Play again starts a new lobby.
   */
  setRole(token: PlayerToken, watch: boolean): CommandResult {
    const player = this.players.get(token)
    if (!player) return fail("unknown player")
    if (player.watching === watch) return OK_SAME
    if (watch && this.phase !== "lobby") return fail("you can only switch to watching in the lobby")
    if (this.phase === "results") return fail("game has finished")
    if (watch) {
      if (this.watcherCount() >= MAX_SPECTATORS) return fail("no room to watch")
      player.watching = true
      player.colour = undefined
    } else {
      if (this.playing().length >= MAX_PLAYERS) return fail("game is full")
      player.watching = false
      player.colour = this.freeColour()
      player.joinedRound = this.phase === "lobby" ? 0 : this.roundIndex + 1
      player.scores = []
      player.facts = []
      player.previousRank = undefined
    }
    return OK_CHANGED
  }

  /** Hand the host role to another connected player, for good. */
  makeHost(token: PlayerToken, playerId: PlayerId): CommandResult {
    if (!this.isHost(token)) return fail("only the host can hand over")
    const target = this.tokenOf(playerId)
    if (target === undefined) return fail("unknown player")
    if (target === token) return fail("you are already the host")
    if (!this.players.get(target)!.connected) return fail("that player is offline")
    this.hostToken = target
    return OK_CHANGED
  }

  /** The token behind a public player id, for the server to act on a kick. */
  tokenOf(playerId: PlayerId): PlayerToken | undefined {
    for (const p of this.players.values()) if (p.id === playerId) return p.token
    return undefined
  }

  /**
   * Remove a player. Their seat, score and paint go; their token may not
   * rejoin (a fresh token can, as a new player). The acting host may remove
   * an absent host, in which case the role passes on.
   */
  kick(token: PlayerToken, playerId: PlayerId, now: number): CommandResult {
    if (!this.isHost(token)) return fail("only the host can remove players")
    const target = this.tokenOf(playerId)
    if (target === undefined) return fail("unknown player")
    if (target === token) return fail("you cannot remove yourself")
    this.players.delete(target)
    this.submissions.delete(target)
    this.ready_.delete(target)
    this.kicked.add(target)
    if (this.hostToken === target) this.hostToken = this.pickHost()
    this.settleIfEveryoneDone(now)
    return OK_CHANGED
  }

  /** Stop after the current round: score it if it is still running, then show final standings. */
  end(token: PlayerToken): CommandResult {
    if (!this.isHost(token)) return fail("only the host can end the game")
    if (this.phase === "guessing") this.finishRound()
    else if (this.phase !== "reveal") return fail("nothing to end")
    this.finish()
    return OK_CHANGED
  }

  // ---- player commands -----------------------------------------------------

  rename(token: PlayerToken, name: PlayerName): CommandResult {
    const player = this.players.get(token)
    if (!player) return fail("unknown player")
    if (player.name === name) return OK_SAME
    player.name = name
    return OK_CHANGED
  }

  /** Use one of the game's hints on this round: one per round, so two bands never box the answer in. */
  hint(token: PlayerToken, axis: HintAxis): CommandResult {
    const player = this.players.get(token)
    if (!player) return fail("unknown player")
    if (this.phase !== "guessing") return fail("no round to hint")
    if (player.watching || player.joinedRound > this.roundIndex) return fail("you are not playing this round")
    if (this.hints.has(token)) return fail("one hint per round")
    if (player.hintsUsed >= this.config.hints) return fail("no hints left")
    this.hints.set(token, axis)
    player.hintsUsed++
    return OK_CHANGED
  }

  setPaint(token: PlayerToken, paint: PaintSubmission): CommandResult {
    const player = this.players.get(token)
    if (!player) return fail("unknown player")
    if (player.watching) return fail("you are watching")
    // Uploads are debounced on the client, so one can arrive just after the
    // round ended. It is stale rather than wrong: drop it quietly.
    if (this.phase !== "guessing") return OK_SAME
    if (player.joinedRound > this.roundIndex) return fail("spectating this round")
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
  lock(token: PlayerToken, now: number): CommandResult {
    const player = this.players.get(token)
    if (!player) return fail("unknown player")
    if (this.phase !== "guessing") return fail("not guessing")
    if (player.watching) return fail("you are watching")
    if (player.joinedRound > this.roundIndex) return fail("spectating this round")
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
    const player = this.players.get(token)
    if (!player) return fail("unknown player")
    if (this.phase !== "guessing") return fail("not guessing")
    const current = this.submissions.get(token)
    if (!current?.locked) return OK_SAME
    current.locked = false
    return OK_CHANGED
  }

  /** Done reading the reveal. The next round starts once every connected player is. */
  ready(token: PlayerToken, now: number): CommandResult {
    const player = this.players.get(token)
    if (!player) return fail("unknown player")
    if (this.phase !== "reveal") return fail("nothing to be ready for")
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
  private settleIfEveryoneDone(now: number): void {
    if (this.phase === "guessing") {
      let active = 0
      for (const p of this.players.values()) {
        if (!p.connected || p.watching || p.joinedRound > this.roundIndex) continue
        active++
        if (!this.submissions.get(p.token)?.locked) return
      }
      if (active > 0) this.finishRound()
    } else if (this.phase === "reveal") {
      let present = 0
      for (const p of this.players.values()) {
        if (!p.connected || p.watching) continue
        present++
        if (!this.ready_.has(p.token)) return
      }
      if (present > 0) this.advance(now)
    }
  }

  // ---- clock ---------------------------------------------------------------

  /** Advance time-driven transitions. Returns true if the state changed. */
  tick(now: number): boolean {
    if (this.phase === "lobby") return this.freeLapsedSeats(now)
    if (this.phase === "guessing" && now >= this.deadline + ROUND_GRACE_MS) {
      this.finishRound()
      return true
    }
    return false
  }

  /** Epoch ms of the next time-driven transition, or undefined if none is pending. */
  nextWakeAt(): number | undefined {
    if (this.phase === "guessing") return this.deadline + ROUND_GRACE_MS
    if (this.phase === "lobby") {
      let at: number | undefined = undefined
      for (const p of this.players.values()) {
        if (p.leftAt === undefined) continue
        const due = p.leftAt + SEAT_GRACE_MS
        if (at === undefined || due < at) at = due
      }
      return at
    }
    return undefined
  }

  /** In the lobby, free the seats of players gone longer than SEAT_GRACE_MS, and the host role with one. */
  private freeLapsedSeats(now: number): boolean {
    let changed = false
    for (const [tok, p] of this.players) {
      if (p.leftAt === undefined || now < p.leftAt + SEAT_GRACE_MS) continue
      this.players.delete(tok)
      changed = true
    }
    if (changed && this.hostToken !== undefined && !this.players.has(this.hostToken)) this.hostToken = this.pickHost()
    return changed
  }

  // ---- transitions ---------------------------------------------------------

  private beginRound(index: number, now: number): void {
    this.roundIndex = index
    this.phase = "guessing"
    this.deadline = now + this.config.roundMs
    this.submissions.clear()
    this.hints.clear()
    this.ready_.clear()
    this.reveal = undefined
  }

  private finishRound(): void {
    const q = this.questions[this.roundIndex]!
    const res = resolutionForTolerance(q.toleranceKm)
    const results: RoundResultView[] = []
    // Snapshot ranks before any score changes so arrows compare like with like.
    for (const p of this.playing()) p.previousRank = this.rankOf(p)
    for (const p of this.playing()) {
      if (p.joinedRound > this.roundIndex) continue
      const sub = this.submissions.get(p.token)
      let region: RoundResultView["region"]
      let paint: PaintSubmission | undefined = undefined
      const roundMs = this.config.roundMs
      const lockMs = sub?.locked && sub.lockedAt !== undefined ? sub.lockedAt - (this.deadline - roundMs) : undefined
      const facts: RoundFacts = {
        label: q.label,
        score: 0,
        passed: true,
        lockSeconds: lockMs === undefined ? undefined : lockMs / 1000,
        roundSeconds: roundMs / 1000,
        areaKm2: 0
      }
      const painted = sub && Object.keys(sub.paint.cells).length > 0 ? sub.paint : undefined
      const cells = painted ? [...PaintLayer.fromRecord(res, painted.cells).toCells()] : []
      // A pass, or a blank map at the deadline: the two score alike, so
      // waiting out the clock never beats pressing Pass.
      const dist = painted ? buildDistribution(cells, painted.floor) : undefined
      const scored = scoreAnswer(dist, q, this.kernel)
      const { score } = scored
      const { A, B } = "A" in scored.parts ? scored.parts : { A: 0, B: 0 }
      if (painted && dist) {
        facts.passed = false
        facts.areaKm2 = cells.reduce((a, c) => a + c.areaKm2, 0)
        if (q.kind === "region" && "shape" in scored.parts) {
          region = { ...scored.parts, ...regionFit(dist, q) }
          const m = regionMisfit(dist, q)
          // A country's tolerance is a fifth of its equivalent radius.
          facts.region = {
            precision: m.precision,
            nextDoor: m.precision < 0.1 && m.off !== undefined && m.off.km < 5 * q.toleranceKm
          }
        } else {
          const e = explainPoint(dist, q.answer, q.toleranceKm, A, B, this.kernel)
          const best = Math.max(e.best, score)
          facts.point = {
            spot: e.spot,
            km: e.km,
            spread: 1000 - best,
            distance: best - score,
            hedged: isHedge(e, score, q.toleranceKm),
            toleranceKm: q.toleranceKm
          }
        }
        paint = painted
      }
      p.scores[this.roundIndex] = score
      p.facts[this.roundIndex] = { ...facts, score }
      const hint = this.hints.get(p.token)
      results.push({
        playerId: p.id,
        score,
        A,
        B,
        paint,
        res,
        ...(region ? { region } : {}),
        ...(hint ? { hint } : {})
      })
    }
    results.sort((a, b) => b.score - a.score)
    const photo = revealPhoto(q)
    this.phase = "reveal"
    this.reveal = {
      index: this.roundIndex,
      total: this.questions.length,
      question: questionView(q),
      answer: q.answer,
      label: q.label,
      wiki: q.wiki,
      ...(photo ? { photo } : {}),
      results
    }
  }

  private advance(now: number): void {
    if (this.roundIndex + 1 < this.questions.length) {
      this.beginRound(this.roundIndex + 1, now)
      return
    }
    this.finish()
  }

  private finish(): void {
    this.phase = "results"
    this.reveal = undefined
    this.results = this.playing()
      .map((p) => ({
        playerId: p.id,
        total: sum(p.scores),
        rounds: Array.from({ length: this.roundIndex + 1 }, (_, i) => {
          const score = p.scores[i]
          return score === undefined ? {} : { score }
        })
      }))
      .sort((a, b) => b.total - a.total)
    this.awards = pickAwards(
      this.playing().map((p) => ({
        playerId: p.id,
        rounds: Array.from({ length: this.roundIndex + 1 }, (_, i) => p.facts[i])
      })),
      this.seed
    )
  }

  // ---- views ---------------------------------------------------------------

  private rankOf(player: Player): number {
    const mine = sum(player.scores)
    let rank = 1
    for (const p of this.playing()) if (sum(p.scores) > mine) rank++
    return rank
  }

  private playerViews(): PlayerView[] {
    const host = this.effectiveHost()
    return [...this.players.values()]
      .map((p) => ({
        id: p.id,
        name: p.name,
        colour: p.colour,
        watching: p.watching,
        connected: p.connected,
        isHost: p.token === host,
        locked: this.submissions.get(p.token)?.locked ?? false,
        score: sum(p.scores),
        // Spectators are unranked (0) and listed after the players.
        rank: p.watching ? 0 : this.rankOf(p),
        previousRank: p.previousRank
      }))
      .sort((a, b) => Number(a.watching) - Number(b.watching) || a.rank - b.rank || a.name.localeCompare(b.name))
  }

  view(token: PlayerToken, now: number): GameView {
    const me = this.players.get(token)
    const q = this.phase === "guessing" ? this.questions[this.roundIndex] : undefined
    return {
      code: this.code,
      phase: this.phase,
      config: this.config,
      serverTime: now,
      you: {
        id: me?.id,
        isHost: me !== undefined && this.isHost(me.token),
        spectating: me !== undefined && !me.watching && this.phase !== "lobby" && me.joinedRound > this.roundIndex,
        watching: me?.watching ?? false,
        locked: this.submissions.get(token)?.locked ?? false,
        paint: this.paintOf(token),
        ...this.hintView(token),
        hintsLeft: me && !me.watching ? Math.max(0, this.config.hints - me.hintsUsed) : 0
      },
      players: this.playerViews(),
      round: q
        ? {
            index: this.roundIndex,
            total: this.questions.length,
            question: questionView(q),
            deadline: this.deadline
          }
        : undefined,
      reveal: this.phase === "reveal" && this.reveal ? { ...this.reveal, ready: this.readyIds() } : undefined,
      ...this.upcoming(),
      results: this.phase === "results" ? this.results : undefined,
      playedRounds:
        this.phase === "results" ? this.questions.slice(0, this.roundIndex + 1).map(playedRound) : undefined,
      awards: this.phase === "results" ? this.awards : undefined
    }
  }

  /** This player's hint band on the current round, while it is played and revealed. */
  private hintView(token: PlayerToken): { hint?: HintBand } {
    const axis = this.hints.get(token)
    const q = this.questions[this.roundIndex]
    if (!axis || !q || (this.phase !== "guessing" && this.phase !== "reveal")) return {}
    return { hint: this.roundBand(q, axis) }
  }

  /** The round's band of each axis: the same for everyone who asks. */
  private roundBand(q: Question | RegionQuestion, axis: HintAxis): HintBand {
    const u = seededUnit(this.seed, this.roundIndex, axis === "latitude" ? 1 : 2)
    return hintBand(q.answer, q.toleranceKm, axis, u)
  }

  /** The next round's pictures: round 1's in the lobby, the following round's while one is played or revealed. */
  private upcoming(): { upcoming?: QuestionPictures } {
    const next = this.phase === "lobby" ? 0 : this.phase === "results" ? -1 : this.roundIndex + 1
    const q = this.questions[next]
    if (!q) return {}
    const pictures = questionPictures(q)
    return Object.keys(pictures).length > 0 ? { upcoming: pictures } : {}
  }

  private readyIds(): PlayerId[] {
    const ids: PlayerId[] = []
    for (const tok of this.ready_) {
      const p = this.players.get(tok)
      if (p) ids.push(p.id)
    }
    return ids
  }

  /** This player's paint on the round being guessed, as last uploaded. */
  paintOf(token: PlayerToken): PaintSubmission | undefined {
    return this.phase === "guessing" ? this.submissions.get(token)?.paint : undefined
  }

  /** The reveal on show, the same object for as long as it shows. */
  get roundReveal(): RoundReveal | undefined {
    return this.phase === "reveal" ? this.reveal : undefined
  }

  /** For tests and diagnostics. */
  get playerTokens(): PlayerToken[] {
    return [...this.players.keys()]
  }
}

function sum(xs: (number | undefined)[]): number {
  let t = 0
  for (const x of xs) t += x ?? 0
  return t
}

/**
 * Who takes over as host if this player leaves, read from a view: the
 * longest-standing online player, as the server picks. Player ids are
 * issued in join order (p1, p2, ...), so the lowest id is the earliest.
 */
export function nextHostAfter(players: PlayerView[], leavingId: PlayerId | undefined): PlayerView | undefined {
  const seq = (p: PlayerView) => Number(p.id.slice(1))
  return players.filter((p) => p.id !== leavingId && p.connected).sort((a, b) => seq(a) - seq(b))[0]
}

/** Generate a join code that avoids look-alike characters. */
export function generateCode(rnd: () => number = Math.random, length = 4): RoomCode {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
  let out = ""
  for (let i = 0; i < length; i++) out += alphabet.charAt(Math.floor(rnd() * alphabet.length))
  return roomCode(out)
}

/** Which kind of question in the host's mix this was. */
export function questionType(q: Question | RegionQuestion): QuestionType {
  if (q.flag) return "flags"
  if (q.topic === "state") return "states"
  if (q.topic) return "features"
  if (q.kind === "region") return "countries"
  return q.kind === "photo" ? "landmarks" : "places"
}

function playedRound(q: Question | RegionQuestion): PlayedRound {
  return {
    label: q.label,
    type: questionType(q),
    ...(q.topic ? { topic: q.topic } : {}),
    ...(q.kind === "region" && !q.flag ? { regionId: q.id } : {}),
    ...questionPictures(q)
  }
}

/** A question's photo and flag, including the flag shown beside a country's name, and the photo for its reveal. */
export function questionPictures(q: Question | RegionQuestion): QuestionPictures {
  const flag = q.flag ?? (q.kind === "region" ? q.countryFlag : undefined)
  const photo = revealPhoto(q)
  return {
    ...(q.kind !== "region" && q.image ? { image: q.image } : {}),
    ...(flag ? { flag } : {}),
    ...(photo ? { revealPhoto: photo } : {})
  }
}

/**
 * What players see of a question: never the answer. A country round sends
 * the country's id, which the prompt names anyway; a flag round sends the
 * flag's code, which the flag gives away anyway.
 */
function questionView(q: Question | RegionQuestion): QuestionView {
  const extra = { ...(q.flag ? { flag: q.flag } : {}), ...(q.topic ? { topic: q.topic } : {}) }
  if (q.kind === "region") return { prompt: q.prompt, toleranceKm: q.toleranceKm, regionId: q.id, ...extra }
  return { prompt: q.prompt, image: q.image, toleranceKm: q.toleranceKm, ...extra }
}
