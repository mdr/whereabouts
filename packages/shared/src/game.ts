/**
 * Pure multiplayer game state machine. No I/O, no timers: callers pass `now`
 * and poll `nextWakeAt()` to know when to call `tick`. Every mutator returns
 * whether anything changed so the transport layer can rebroadcast views.
 */
import { buildDistribution, kernelById, scoreDistribution, type Kernel } from "./scoring.ts";
import { PaintLayer, resolutionForTolerance } from "./paint.ts";
import { shuffle, type Question } from "./questions.ts";
import type {
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
  revealMs: 20_000,
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
  readonly config: GameConfig;
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
  private reveal: RevealView | null = null;
  private results: FinalStanding[] | null = null;

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

  /** Join or reconnect. A known token reclaims its seat. */
  join(token: string, name: string, now: number): CommandResult {
    const existing = this.players.get(token);
    if (existing) {
      existing.connected = true;
      if (this.hostToken === null) this.hostToken = token;
      return OK_CHANGED;
    }
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

  /** Connection dropped. In the lobby the seat is freed; mid-game it is kept. */
  disconnect(token: string, now: number): CommandResult {
    const player = this.players.get(token);
    if (!player) return OK_SAME;
    player.connected = false;
    if (this.phase === "lobby") this.players.delete(token);
    if (this.hostToken === token) this.hostToken = this.pickHost();
    void now;
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

  get connectedCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.connected) n++;
    return n;
  }

  // ---- host commands -------------------------------------------------------

  start(token: string, now: number): CommandResult {
    if (token !== this.hostToken) return fail("only the host can start");
    if (this.phase !== "lobby") return fail("game already started");
    if (this.players.size === 0) return fail("no players");
    const count = Math.min(this.config.rounds, this.pool.length);
    this.questions = shuffle(this.pool, this.seed).slice(0, count);
    for (const p of this.players.values()) {
      p.scores = [];
      p.previousRank = null;
      p.joinedRound = 0;
    }
    this.results = null;
    this.beginRound(0, now);
    return OK_CHANGED;
  }

  /** Host advances from the reveal. Also called by tick on auto-advance. */
  next(token: string, now: number): CommandResult {
    if (token !== this.hostToken) return fail("only the host can advance");
    if (this.phase !== "reveal") return fail("nothing to advance");
    this.advance(now);
    return OK_CHANGED;
  }

  again(token: string, now: number): CommandResult {
    if (token !== this.hostToken) return fail("only the host can restart");
    if (this.phase !== "results") return fail("game is still running");
    this.phase = "lobby";
    this.roundIndex = -1;
    this.reveal = null;
    this.results = null;
    this.submissions.clear();
    this.seed = now;
    for (const p of this.players.values()) {
      p.scores = [];
      p.previousRank = null;
      p.joinedRound = 0;
    }
    for (const [tok, p] of this.players) if (!p.connected) this.players.delete(tok);
    if (this.hostToken !== null && !this.players.has(this.hostToken)) this.hostToken = this.pickHost();
    return OK_CHANGED;
  }

  // ---- player commands -----------------------------------------------------

  setPaint(token: string, paint: PaintSubmission): CommandResult {
    const player = this.players.get(token);
    if (!player) return fail("unknown player");
    if (this.phase !== "guessing") return fail("not guessing");
    if (player.joinedRound > this.roundIndex) return fail("spectating this round");
    const current = this.submissions.get(token);
    if (current?.locked) return fail("already locked");
    this.submissions.set(token, { paint, locked: false });
    // Paint is private until the reveal, so other views do not change.
    return OK_SAME;
  }

  lock(token: string): CommandResult {
    const player = this.players.get(token);
    if (!player) return fail("unknown player");
    if (this.phase !== "guessing") return fail("not guessing");
    if (player.joinedRound > this.roundIndex) return fail("spectating this round");
    const current = this.submissions.get(token);
    if (!current) return fail("nothing painted");
    if (current.locked) return OK_SAME;
    current.locked = true;
    return OK_CHANGED;
  }

  // ---- clock ---------------------------------------------------------------

  /** Advance time-driven transitions. Returns true if the state changed. */
  tick(now: number): boolean {
    if (this.phase === "guessing" && now >= this.deadline) {
      this.finishRound(now);
      return true;
    }
    if (this.phase === "reveal" && this.reveal && now >= this.reveal.autoAdvanceAt) {
      this.advance(now);
      return true;
    }
    return false;
  }

  /** Epoch ms of the next time-driven transition, or null if none is pending. */
  nextWakeAt(): number | null {
    if (this.phase === "guessing") return this.deadline;
    if (this.phase === "reveal" && this.reveal) return this.reveal.autoAdvanceAt;
    return null;
  }

  // ---- transitions ---------------------------------------------------------

  private beginRound(index: number, now: number): void {
    this.roundIndex = index;
    this.phase = "guessing";
    this.deadline = now + this.config.roundMs;
    this.submissions.clear();
    this.reveal = null;
  }

  private finishRound(now: number): void {
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
      autoAdvanceAt: now + this.config.revealMs,
    };
  }

  private advance(now: number): void {
    if (this.roundIndex + 1 < this.questions.length) {
      this.beginRound(this.roundIndex + 1, now);
      return;
    }
    this.phase = "results";
    this.reveal = null;
    this.results = [...this.players.values()]
      .map((p) => ({ playerId: p.id, total: sum(p.scores), rounds: p.scores.map((s) => s ?? 0) }))
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
    return [...this.players.values()]
      .map((p) => ({
        id: p.id,
        name: p.name,
        colour: p.colour,
        connected: p.connected,
        isHost: p.token === this.hostToken,
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
        isHost: me !== undefined && me.token === this.hostToken,
        spectating: me !== undefined && this.phase !== "lobby" && me.joinedRound > this.roundIndex,
        locked: this.submissions.get(token)?.locked ?? false,
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
      reveal: this.phase === "reveal" ? this.reveal : null,
      results: this.phase === "results" ? this.results : null,
    };
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
