/**
 * The real game server inside a test's own process, on a spare port and a
 * fake clock: a browser test chooses its questions, changes a game directly
 * and reads it back, against the same code players meet.
 */
import { createApp, type App } from "../app.ts"
import { BANK, configureGameRooms, GameRoom } from "../rooms.ts"
import { FakeClock } from "./fake-clock.ts"
import type { CommandResult } from "@whereabouts/shared/game/command-result"
import type { Game } from "@whereabouts/shared/game/game"
import type { HintAxis } from "@whereabouts/shared/hints"
import type { GameConfig } from "@whereabouts/shared/protocol/config"
import type { Question } from "@whereabouts/shared/questions"
import type { PlayerToken, RoomCode } from "@whereabouts/shared/ids"
import type { LatLon } from "@whereabouts/shared/geo"
import { viewIn } from "@whereabouts/shared/game/view-in"
import { Phase } from "@whereabouts/shared/protocol/views"
import type { Instant, Km } from "@whereabouts/shared/units"
import { blobPaint } from "../extra-players/blob-paint.ts"
import { seatPlayers } from "../extra-players/seat-players.ts"

export interface InProcessOptions {
  config?: Partial<GameConfig>
  /** Only these may be asked; every question by default. */
  questions?: (question: Question) => boolean
}

const UNLIMITED = { maxOpen: 1000, burst: 1000, perSecond: 1000 }

export class InProcessServer {
  readonly clock: FakeClock
  /** Where the game's WebSocket listens. */
  readonly socketUrl: string
  private readonly app: App

  private constructor(app: App, clock: FakeClock, socketUrl: string) {
    this.app = app
    this.clock = clock
    this.socketUrl = socketUrl
  }

  /** One at a time per process: rooms read their clock, questions and config from module state. */
  static async start({ config = {}, questions }: InProcessOptions = {}): Promise<InProcessServer> {
    const clock = new FakeClock()
    const bank = questions ? { ...BANK, catalogue: BANK.catalogue.filter(questions) } : BANK
    configureGameRooms({ clock, bank, config })
    const app = createApp({ staticDir: undefined, logLevel: "warning", addressLimits: UNLIMITED })
    const address = await app.listen(0)
    return new InProcessServer(app, clock, `${address.replace(/^http/, "ws")}/ws`)
  }

  /** The game a room holds, or undefined before it is hosted. */
  game(code: RoomCode): Game | undefined {
    return this.room(code)?.state
  }

  /** The code of the only game: most tests host one. */
  get onlyCode(): RoomCode | undefined {
    const ids = [...this.app.rivalis.rooms.keys()]
    return ids.length === 1 ? (ids[0] as RoomCode) : undefined
  }

  get onlyGame(): Game | undefined {
    const code = this.onlyCode
    return code && this.game(code)
  }

  /** Change a game directly, then send its players the result. */
  act(code: RoomCode, change: (game: Game, now: Instant) => void): void {
    const room = this.room(code)
    if (!room) throw new Error(`no game ${code}`)
    room.act(change)
  }

  /** Seat players with no connection behind them, as if each had joined and kept still. */
  seat(code: RoomCode, names: string[]): PlayerToken[] {
    let tokens: PlayerToken[] = []
    this.act(code, (game, now) => {
      tokens = seatPlayers(game, names, now)
    })
    return tokens
  }

  /** A seated player paints an even blob, `radius` across, around `at`. */
  paint(code: RoomCode, token: PlayerToken, at: LatLon, radius: Km): void {
    this.act(code, (game, now) => {
      const { tolerance } = viewIn(game.view(token, now), Phase.GUESSING).round.question.answer
      const painted = game.setPaint(token, blobPaint(tolerance, at, radius))
      if (!painted.ok) throw new Error(`could not paint: ${painted.error}`)
    })
  }

  /** A seated player presses Done (a pass, with nothing painted). */
  lock(code: RoomCode, token: PlayerToken): void {
    this.command(code, (game, now) => game.lock(token, now))
  }

  /** A seated player presses Ready at the reveal. */
  ready(code: RoomCode, token: PlayerToken): void {
    this.command(code, (game, now) => game.ready(token, now))
  }

  /** A seated player uses a hint. */
  hint(code: RoomCode, token: PlayerToken, axis: HintAxis): void {
    this.command(code, (game) => game.hint(token, axis))
  }

  async close(): Promise<void> {
    await this.app.close()
  }

  private command(code: RoomCode, run: (game: Game, now: Instant) => CommandResult): void {
    this.act(code, (game, now) => {
      const result = run(game, now)
      if (!result.ok) throw new Error(`command refused: ${result.error}`)
    })
  }

  private room(code: RoomCode): GameRoom | undefined {
    const room = this.app.rivalis.rooms.get(code)
    return room instanceof GameRoom ? room : undefined
  }
}
