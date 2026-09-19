/**
 * Pure multiplayer game state machine. No I/O, no timers: callers pass `now`
 * and poll `nextWakeAt()` to know when to call `tick`. Every mutator returns
 * whether anything changed so the transport layer can rebroadcast views.
 */
import { buildDistribution, kernelById, scoreDistribution, type Kernel } from "./scoring.ts";
import { PaintLayer, resolutionForTolerance } from "./paint.ts";
import { pickQuestions, type Question } from "./questions.ts";
import type {
  ConfigurePatch,
  FinalStanding,
  GameConfig,
  GameView,
  PaintSubmission,
  Phase,
  PlayerView,
  RevealView,
  RoundResultView,
} from "./protocol.ts";

export const DEFAULT_CONFIG: GameConfig = {
  rounds: 8,
  roundMs: 60_000,
  kernelId: "multi-equal",
};

interface Player {
  id: string;
  token: string;
  name: string;
  colour: number;
  connected: boolean;
  joinedAt: number;
  /** First round index this player may play. Later joiners sit out the current one. */
  joinedRound: number;
  scores: number[];
  previousRank: number | null;
}

interface Submission {
  paint: PaintSubmission;
  locked: boolean;
}

export type CommandResult = { ok: true; changed: boolean } | { ok: false; error: string };

const OK_CHANGED: CommandResult = { ok: true, changed: true };
const OK_SAME: CommandResult = { ok: true, changed: false };
const fail = (error: string): CommandResult => ({ ok: false, error });

export class Game {
  readonly code: string;
  config: GameConfig;
  private readonly pool: Question[];
  private readonly kernel: Kernel;

  phase: Phase = "lobby";
  private players = new Map<string, Player>();
  private hostToken: string | null = null;
  private nextColour = 0;
  private nextPlayerId = 1;

  private questions: Question[] = [];
  private roundIndex = -1;
  private deadline = 0;
  private submissions = new Map<string, Submission>();
  /** Tokens of players who have pressed Ready on the current reveal. */
  private ready_ = new Set<string>();
  private reveal: RevealView | null = null;
  private results: FinalStanding[] | null = null;
  /** Tokens the host has removed; they may not reclaim a seat. */
  private kicked = new Set<string>();

  private seed: number;

  constructor(code: string, pool: Question[], config: Partial<GameConfig> = {}, seed = Date.now()) {
    this.seed = seed;
    this.code = code;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.pool = pool;
    this.kernel = kernelById(this.config.kernelId);
    if (pool.length === 0) throw new Error("question pool is empty");
  }

  // ---- membership ----------------------------------------------------------

  /** Join or reconnect. A known token reclaims its seat (and the host role, if it was theirs). */
  join(token: string, name: string, now: number): CommandResult {
    const existing = this.players.get(token);
    if (existing) {
      existing.connected = true;
      if (this.hostToken === null) this.hostToken = token;
      return OK_CHANGED;
    }
    if (this.kicked.has(token)) return fail("removed by the host");
    if (this.phase === "results") return fail("game has finished");
    const player: Player = {
      id: `p${this.nextPlayerId++}`,
      token,
      name,
      colour: this.nextColour++,
      connected: true,
      joinedAt: now,
      joinedRound: this.phase === "lobby" ? 0 : this.roundIndex + 1,
      scores: [],
      previousRank: null,
    };
    this.players.set(token, player);
    if (this.hostToken === null) this.hostToken = token;
    return OK_CHANGED;
  }

  /**
   * Connection dropped. In the lobby the seat is freed; mid-game it is kept.
   * The host keeps the role while away (a refresh is the common case); the
   * longest-standing connected player acts as host in the meantime.
   */
  disconnect(token: string, now: number): CommandResult {
    const player = this.players.get(token);
    if (!player) return OK_SAME;
    player.connected = false;
    if (this.phase === "lobby") {
      this.players.delete(token);
      if (this.hostToken === token) this.hostToken = this.pickHost();
    }
    // The others should not wait on someone who has gone.
    this.settleIfEveryoneDone(now);
    return OK_CHANGED;
  }

  private pickHost(): string | null {
    let best: Player | null = null;
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      if (!best || p.joinedAt < best.joinedAt) best = p;
    }
    return best?.token ?? null;
  }

  /** Who may use the host controls right now: the host if connected, else the acting host. */
  private effectiveHost(): string | null {
    const host = this.hostToken ? this.players.get(this.hostToken) : undefined;
    if (host?.connected) return host.token;
    return this.pickHost() ?? this.hostToken;
  }

  private isHost(token: string): boolean {
    return this.effectiveHost() === token;
  }

  get connectedCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.connected) n++;
    return n;
  }

  // ---- host commands -------------------------------------------------------

  start(token: string, now: number): CommandResult {
    if (!this.isHost(token)) return fail("only the host can start");
    if (this.phase !== "lobby") return fail("game already started");
    if (this.players.size === 0) return fail("no players");
    const count = Math.min(this.config.rounds, this.pool.length);
    this.questions = pickQuestions(this.pool, count, this.seed);
    for (const p of this.players.values()) {
      p.scores = [];
      p.previousRank = null;
      p.joinedRound = 0;
    }
    this.results = null;
    this.beginRound(0, now);
    return OK_CHANGED;
  }

  /** Host tunes rounds and round length while everyone is still in the lobby. */
  configure(token: string, patch: ConfigurePatch): CommandResult {
    if (!this.isHost(token)) return fail("only the host can change settings");
    if (this.phase !== "lobby") return fail("settings are locked once the game starts");
    const next = { ...this.config, ...patch };
    if (next.rounds === this.config.rounds && next.roundMs === this.config.roundMs) return OK_SAME;
    this.config = next;
    return OK_CHANGED;
  }

  /** Host advances from the reveal without waiting for the others. */
  next(token: string, now: number): CommandResult {
    if (!this.isHost(token)) return fail("only the host can advance");
    if (this.phase !== "reveal") return fail("nothing to advance");
    this.advance(now);
    return OK_CHANGED;
  }

  again(token: string, now: number): CommandResult {
    if (!this.isHost(token)) return fail("only the host can restart");
    if (this.phase !== "results") return fail("game is still running");
    this.phase = "lobby";
    this.roundIndex = -1;
    this.reveal = null;
    this.results = null;
    this.submissions.clear();
    this.ready_.clear();
    this.seed = now;
    for (const p of this.players.values()) {
      p.scores = [];
      p.previousRank = null;
      p.joinedRound = 0;
    }
    for (const [tok, p] of this.players) if (!p.connected) this.players.delete(tok);
    if (this.hostToken === null || !this.players.has(this.hostToken)) this.hostToken = this.pickHost();
    return OK_CHANGED;
  }

  /** The token behind a public player id, for the server to act on a kick. */
  tokenOf(playerId: string): string | undefined {
    for (const p of this.players.values()) if (p.id === playerId) return p.token;
    return undefined;
  }

  /**
   * Remove a player. Their seat, score and paint go; their token may not
   * rejoin (a fresh token can, as a new player). The acting host may remove
   * an absent host, in which case the role passes on.
   */
  kick(token: string, playerId: string, now: number): CommandResult {
    if (!this.isHost(token)) return fail("only the host can remove players");
    const target = this.tokenOf(playerId);
    if (target === undefined) return fail("unknown player");
    if (target === token) return fail("you cannot remove yourself");
    this.players.delete(target);
    this.submissions.delete(target);
    this.ready_.delete(target);
    this.kicked.add(target);
    if (this.hostToken === target) this.hostToken = this.pickHost();
    this.settleIfEveryoneDone(now);
    return OK_CHANGED;
  }

  /** Stop after the current round: score it if it is still running, then show final standings. */
  end(token: string): CommandResult {
    if (!this.isHost(token)) return fail("only the host can end the game");
    if (this.phase === "guessing") this.finishRound();
    else if (this.phase !== "reveal") return fail("nothing to end");
    this.finish();
    return OK_CHANGED;
  }

  // ---- player commands -----------------------------------------------------

  rename(token: string, name: string): CommandResult {
    const player = this.players.get(token);
    if (!player) return fail("unknown player");
    if (player.name === name) return OK_SAME;
    player.name = name;
    return OK_CHANGED;
  }

  setPaint(token: string, paint: PaintSubmission): CommandResult {
    const player = this.players.get(token);
    if (!player) return fail("unknown player");
    // Uploads are debounced on the client, so one can arrive just after the
    // round ended. It is stale rather than wrong: drop it quietly.
    if (this.phase !== "guessing") return OK_SAME;
    if (player.joinedRound > this.roundIndex) return fail("spectating this round");
    const current = this.submissions.get(token);
    // A stroke's upload can land just after the player locked in; it changes nothing.
    if (current?.locked) return OK_SAME;
    this.submissions.set(token, { paint, locked: false });
    // Paint is private until the reveal, so other views do not change.
    return OK_SAME;
  }

  /** Freeze this player's guess. The round ends early once every active player has. */
  lock(token: string, now: number): CommandResult {
    const player = this.players.get(token);
    if (!player) return fail("unknown player");
    if (this.phase !== "guessing") return fail("not guessing");
    if (player.joinedRound > this.roundIndex) return fail("spectating this round");
    const current = this.submissions.get(token);
    if (!current) return fail("nothing painted");
    if (current.locked) return OK_SAME;
    current.locked = true;
    this.settleIfEveryoneDone(now);
    return OK_CHANGED;
  }

  /** Done reading the reveal. The next round starts once every connected player is. */
  ready(token: string, now: number): CommandResult {
    const player = this.players.get(token);
    if (!player) return fail("unknown player");
    if (this.phase !== "reveal") return fail("nothing to be ready for");
    if (this.ready_.has(token)) return OK_SAME;
    this.ready_.add(token);
    this.settleIfEveryoneDone(now);
    return OK_CHANGED;
  }

  /**
   * Both waiting phases end when everyone still here is done: guessing when
   * every connected active player has locked in, the reveal when every
   * connected player is ready. Nobody present means nothing happens; the
   * deadline (or the host) still governs.
   */
  private settleIfEveryoneDone(now: number): void {
    if (this.phase === "guessing") {
      let active = 0;
      for (const p of this.players.values()) {
        if (!p.connected || p.joinedRound > this.roundIndex) continue;
        active++;
        if (!this.submissions.get(p.token)?.locked) return;
      }
      if (active > 0) this.finishRound();
    } else if (this.phase === "reveal") {
      let present = 0;
      for (const p of this.players.values()) {
        if (!p.connected) continue;
        present++;
        if (!this.ready_.has(p.token)) return;
      }
      if (present > 0) this.advance(now);
    }
  }

  // ---- clock ---------------------------------------------------------------

  /** Advance time-driven transitions. Returns true if the state changed. */
  tick(now: number): boolean {
    if (this.phase === "guessing" && now >= this.deadline) {
      this.finishRound();
      return true;
    }
    return false;
  }

  /** Epoch ms of the next time-driven transition, or null if none is pending. */
  nextWakeAt(): number | null {
    if (this.phase === "guessing") return this.deadline;
    return null;
  }

  // ---- transitions ---------------------------------------------------------

  private beginRound(index: number, now: number): void {
    this.roundIndex = index;
    this.phase = "guessing";
    this.deadline = now + this.config.roundMs;
    this.submissions.clear();
    this.ready_.clear();
    this.reveal = null;
  }

  private finishRound(): void {
    const q = this.questions[this.roundIndex]!;
    const res = resolutionForTolerance(q.toleranceKm);
    const results: RoundResultView[] = [];
    // Snapshot ranks before any score changes so arrows compare like with like.
    for (const p of this.players.values()) p.previousRank = this.rankOf(p);
    for (const p of this.players.values()) {
      if (p.joinedRound > this.roundIndex) continue;
      const sub = this.submissions.get(p.token);
      let score: number;
      let A: number;
      let B: number;
      let paint: PaintSubmission | null = null;
      if (sub && Object.keys(sub.paint.cells).length > 0) {
        const layer = PaintLayer.fromRecord(res, sub.paint.cells);
        const dist = buildDistribution(layer.toCells(), sub.paint.floor);
        ({ score, A, B } = scoreDistribution(dist, q.answer, q.toleranceKm, this.kernel));
        paint = sub.paint;
      } else {
        ({ score, A, B } = scoreDistribution({ points: [], floor: 1 }, q.answer, q.toleranceKm, this.kernel));
      }
      p.scores[this.roundIndex] = score;
      results.push({ playerId: p.id, score, A, B, paint, res });
    }
    results.sort((a, b) => b.score - a.score);
    this.phase = "reveal";
    this.reveal = {
      index: this.roundIndex,
      total: this.questions.length,
      question: { prompt: q.prompt, image: q.image, toleranceKm: q.toleranceKm },
      answer: q.answer,
      label: q.label,
      results,
      ready: [],
    };
  }

  private advance(now: number): void {
    if (this.roundIndex + 1 < this.questions.length) {
      this.beginRound(this.roundIndex + 1, now);
      return;
    }
    this.finish();
  }

  private finish(): void {
    this.phase = "results";
    this.reveal = null;
    this.results = [...this.players.values()]
      .map((p) => ({
        playerId: p.id,
        total: sum(p.scores),
        // One entry per round played; null where this player sat out.
        rounds: Array.from({ length: this.roundIndex + 1 }, (_, i) => p.scores[i] ?? null),
      }))
      .sort((a, b) => b.total - a.total);
  }

  // ---- views ---------------------------------------------------------------

  private rankOf(player: Player): number {
    const mine = sum(player.scores);
    let rank = 1;
    for (const p of this.players.values()) if (sum(p.scores) > mine) rank++;
    return rank;
  }

  private playerViews(): PlayerView[] {
    const host = this.effectiveHost();
    return [...this.players.values()]
      .map((p) => ({
        id: p.id,
        name: p.name,
        colour: p.colour,
        connected: p.connected,
        isHost: p.token === host,
        locked: this.submissions.get(p.token)?.locked ?? false,
        score: sum(p.scores),
        rank: this.rankOf(p),
        previousRank: p.previousRank,
      }))
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  }

  view(token: string, now: number): GameView {
    const me = this.players.get(token);
    const q = this.phase === "guessing" ? this.questions[this.roundIndex] : undefined;
    return {
      code: this.code,
      phase: this.phase,
      config: this.config,
      serverTime: now,
      you: {
        id: me?.id ?? "",
        isHost: me !== undefined && this.isHost(me.token),
        spectating: me !== undefined && this.phase !== "lobby" && me.joinedRound > this.roundIndex,
        locked: this.submissions.get(token)?.locked ?? false,
        paint: this.phase === "guessing" ? (this.submissions.get(token)?.paint ?? null) : null,
      },
      players: this.playerViews(),
      round: q
        ? {
            index: this.roundIndex,
            total: this.questions.length,
            question: { prompt: q.prompt, image: q.image, toleranceKm: q.toleranceKm },
            deadline: this.deadline,
          }
        : null,
      reveal: this.phase === "reveal" && this.reveal ? { ...this.reveal, ready: this.readyIds() } : null,
      results: this.phase === "results" ? this.results : null,
    };
  }

  private readyIds(): string[] {
    const ids: string[] = [];
    for (const tok of this.ready_) {
      const p = this.players.get(tok);
      if (p) ids.push(p.id);
    }
    return ids;
  }

  /** For tests and diagnostics. */
  get playerTokens(): string[] {
    return [...this.players.keys()];
  }
}

function sum(xs: number[]): number {
  let t = 0;
  for (const x of xs) t += x ?? 0;
  return t;
}

/** Generate a join code that avoids look-alike characters. */
export function generateCode(rnd: () => number = Math.random, length = 4): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(rnd() * alphabet.length)];
  return out;
}
