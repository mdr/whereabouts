/**
 * Practice, run on the real rules engine in the browser: one player, no lobby, untimed rounds, unlimited hints,
 * the whole pool in a shuffled order.
 */
import { signal, type ReadonlySignal } from "@preact/signals"
import { realClock, type Clock } from "@whereabouts/shared/clock"
import type { CommandResult } from "@whereabouts/shared/game/command-result"
import { Game } from "@whereabouts/shared/game/game"
import type { HintAxis } from "@whereabouts/shared/hints"
import {
  generateCode,
  playerToken,
  type PlayerId,
  type PlayerName,
  type PlayerToken,
  type RoomCode
} from "@whereabouts/shared/ids"
import type { ConfigurePatch, MapDetail } from "@whereabouts/shared/protocol/config"
import type { GameView, PaintSubmission } from "@whereabouts/shared/protocol/views"
import { shuffle, type Outlines, type Question } from "@whereabouts/shared/questions"
import type { Role } from "@whereabouts/shared/roles"
import type { KernelId } from "@whereabouts/shared/scoring/scoring"
import type { Instant, Ms } from "@whereabouts/shared/units"
import { ConnectionStatus, type ConnectionState } from "./connection-state"
import type { GameService } from "./game-service"

export interface PracticeOptions {
  pool: readonly Question[]
  outlines: Outlines
  mapDetail: MapDetail
  kernelId: KernelId
  name: PlayerName
  clock?: Clock
  /** Fixes the first shuffle; each play again moves on from it. */
  seed?: number
}

const PRACTICE_TOKEN: PlayerToken = playerToken("practice".padEnd(16, "-"))

/** Each play again takes its seed from the last, so every run has its own order. */
const nextSeed = (seed: number): number => (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0

const CONNECTED: ConnectionState = { type: ConnectionStatus.CONNECTED }

export class PracticeGameService implements GameService {
  readonly view: ReadonlySignal<GameView | undefined>
  readonly status: ReadonlySignal<ConnectionState> = signal(CONNECTED)
  readonly lastError: ReadonlySignal<string | undefined>
  readonly clockOffset: ReadonlySignal<Ms> = signal(0)
  readonly code: ReadonlySignal<RoomCode | undefined>
  readonly online: ReadonlySignal<boolean> = signal(true)

  private readonly writableView = signal<GameView | undefined>(undefined)
  private readonly writableError = signal<string | undefined>(undefined)
  private readonly writableCode = signal<RoomCode | undefined>(undefined)

  private readonly options: PracticeOptions
  private readonly clock: Clock
  private seed: number
  private game: Game
  private timer: unknown = undefined

  constructor(options: PracticeOptions) {
    this.options = options
    this.clock = options.clock ?? realClock
    this.seed = options.seed ?? this.clock.now()
    this.game = this.newGame(generateCode())
    this.view = this.writableView
    this.lastError = this.writableError
    this.code = this.writableCode
    this.writableCode.value = this.game.code
  }

  /** Sits down and starts round 1 at once. */
  begin(): void {
    this.startRun()
  }

  dispose(): void {
    this.clearTimer()
  }

  /** There is nothing to reconnect to. */
  rejoin = (): void => undefined

  sendPaint = (paint: PaintSubmission): void => {
    this.run((game) => game.setPaint(PRACTICE_TOKEN, paint))
  }
  lock = (): void => {
    this.run((game, now) => game.lock(PRACTICE_TOKEN, now))
  }
  unlock = (): void => {
    this.run((game) => game.unlock(PRACTICE_TOKEN))
  }
  ready = (): void => {
    this.run((game, now) => game.ready(PRACTICE_TOKEN, now))
  }
  next = (): void => {
    this.run((game, now) => game.next(PRACTICE_TOKEN, now))
  }
  hint = (axis: HintAxis): void => {
    this.run((game) => game.hint(PRACTICE_TOKEN, axis))
  }
  end = (): void => {
    this.run((game) => game.end(PRACTICE_TOKEN))
  }
  /** A fresh run with a new shuffle, straight into round 1. */
  again = (): void => {
    this.seed = nextSeed(this.seed)
    this.game = this.newGame(this.game.code)
    this.startRun()
  }

  // Multiplayer-only: forwarded to the game, which answers as it would a lone host. Screens hide them.
  configure = (patch: ConfigurePatch): void => {
    this.run((game) => game.configure(PRACTICE_TOKEN, patch))
  }
  start = (): void => {
    this.run((game, now) => game.start(PRACTICE_TOKEN, now))
  }
  rename = (name: PlayerName): void => {
    this.run((game) => game.rename(PRACTICE_TOKEN, name))
  }
  kick = (playerId: PlayerId): void => {
    this.run((game, now) => game.kick(PRACTICE_TOKEN, playerId, now))
  }
  leave = (): void => {
    this.run((game) => game.leave(PRACTICE_TOKEN))
  }
  setRole = (role: Role): void => {
    this.run((game) => game.setRole(PRACTICE_TOKEN, role))
  }
  makeHost = (playerId: PlayerId): void => {
    this.run((game) => game.makeHost(PRACTICE_TOKEN, playerId))
  }

  timeUntil = (at: Instant): Ms => at - this.clock.now()

  private newGame(code: RoomCode): Game {
    const { pool, outlines, mapDetail, kernelId } = this.options
    return new Game(
      code,
      { catalogue: pool, outlines },
      {
        config: { roundLength: undefined, hints: undefined, mapDetail, kernelId },
        seed: this.seed,
        questions: shuffle([...pool], this.seed)
      }
    )
  }

  private startRun(): void {
    const joined = this.game.join(PRACTICE_TOKEN, this.options.name, this.clock.now())
    if (!joined.ok) {
      this.writableError.value = joined.reason
      return
    }
    this.run((game, now) => game.start(PRACTICE_TOKEN, now))
  }

  /** Gives a command to the game, then shows the result and sets the next wake-up. */
  private run(command: (game: Game, now: Instant) => CommandResult): void {
    const now = this.clock.now()
    const result = command(this.game, now)
    this.writableError.value = result.ok ? undefined : result.error
    this.publish(now)
  }

  private publish(now: Instant): void {
    this.writableView.value = this.game.view(PRACTICE_TOKEN, now)
    this.writableCode.value = this.game.code
    this.armTimer()
  }

  private armTimer(): void {
    this.clearTimer()
    const at = this.game.nextWakeAt()
    if (at === undefined) return
    this.timer = this.clock.setTimeout(
      () => {
        this.timer = undefined
        const now = this.clock.now()
        if (this.game.tick(now)) this.publish(now)
        else this.armTimer()
      },
      Math.max(0, at - this.clock.now())
    )
  }

  private clearTimer(): void {
    if (this.timer === undefined) return
    this.clock.clearTimeout(this.timer)
    this.timer = undefined
  }
}
