/**
 * The real game server inside a test's own process, on a spare port and a
 * fake clock: a test chooses its questions, plays through players who connect
 * to it or seats players directly, changes a game and reads it back, against
 * the same code players meet.
 */
import { defaultStaticDir, createApp, type App } from "../app.ts"
import { createLogger } from "../telemetry/telemetry.ts"
import { LogCapture, type LogLine } from "./log-capture.ts"
import { createAppFromEnvironment } from "../environment-app.ts"
import type { AddressLimits } from "../address-limiter.ts"
import type { ClientErrorLimits } from "../client-errors/client-errors-route.ts"
import { CLIENT_ERRORS_PATH } from "@whereabouts/shared/protocol/client-error"
import { BANK, configureGameRooms, GameRoom } from "../rooms.ts"
import { FakeClock } from "@whereabouts/shared/test-support/fake-clock"
import { eventually } from "./eventually.ts"
import { TestPlayer } from "./test-player.ts"
import { RawSocket } from "./raw-socket.ts"
import { GameEntryType, type GameEntry } from "@whereabouts/shared/protocol/ticket"
import { Role } from "@whereabouts/shared/roles"
import type { CommandResult } from "@whereabouts/shared/game/command-result"
import { ROUND_GRACE, type Game } from "@whereabouts/shared/game/game"
import type { HintAxis } from "@whereabouts/shared/hints"
import type { GameConfig } from "@whereabouts/shared/protocol/config"
import { answerCentre, type Question } from "@whereabouts/shared/questions"
import type { PlayerToken, RoomCode } from "@whereabouts/shared/ids"
import type { LatLon } from "@whereabouts/shared/geo"
import { viewIn } from "@whereabouts/shared/game/view-in"
import { Phase } from "@whereabouts/shared/protocol/views"
import type { Instant, Km } from "@whereabouts/shared/units"
import { blobPaint } from "../extra-players/blob-paint.ts"
import { seatPlayers } from "../extra-players/seat-players.ts"

export interface InProcessOptions {
  config?: Partial<GameConfig>
  /** The questions to choose from, in place of the real ones. */
  catalogue?: readonly Question[]
  /** Only these may be asked; every question by default. */
  questions?: (question: Question) => boolean
  /** Per address; unlimited by default. */
  addressLimits?: AddressLimits
  /** Per address and overall, for browsers reporting errors. */
  clientErrorLimits?: ClientErrorLimits
  /** Serves the development endpoints. */
  devTools?: boolean
  /** A built client to serve. */
  staticDir?: string
  /** How often idle sockets are pinged, in real milliseconds. */
  heartbeatIntervalMs?: number
  /** What may queue unread for one socket before it is dropped. */
  maxBufferedBytes?: number
  /** Serve metrics, on a port of its own. */
  metrics?: boolean
  /** Where room codes' letters come from; Math.random by default. */
  random?: () => number
  /** The server's clock stands at this time until advanced, rather than running. */
  frozenAt?: Instant
  /** Start as main does from this environment, whose game and address settings replace the ones above. */
  environment?: Record<string, string>
}

const UNLIMITED = { maxOpen: 1000, burst: 1000, perSecond: 1000 }

export class InProcessServer {
  readonly clock: FakeClock
  /** Where the game's WebSocket listens. */
  readonly socketUrl: string
  readonly httpUrl: string
  private readonly app: App
  private readonly players: TestPlayer[] = []

  private readonly logs: LogCapture

  private constructor(app: App, clock: FakeClock, httpUrl: string, logs: LogCapture) {
    this.app = app
    this.logs = logs
    this.clock = clock
    this.httpUrl = httpUrl
    this.socketUrl = `${httpUrl.replace(/^http/, "ws")}/ws`
  }

  /** One at a time per process: rooms read their clock, questions and config from module state. */
  static async start({
    config = {},
    catalogue = BANK.catalogue,
    questions,
    addressLimits = UNLIMITED,
    clientErrorLimits,
    devTools,
    staticDir,
    heartbeatIntervalMs,
    maxBufferedBytes,
    metrics,
    environment,
    random,
    frozenAt
  }: InProcessOptions = {}): Promise<InProcessServer> {
    const clock = new FakeClock({ frozenAt })
    const bank = { ...BANK, catalogue: questions ? catalogue.filter(questions) : catalogue }
    configureGameRooms({ clock, bank, config })
    const logs = new LogCapture()
    const logger = createLogger("info", logs)
    const app = environment
      ? createAppFromEnvironment(environment, defaultStaticDir(), { logger }).app
      : createApp({
          staticDir,
          logger,
          metricsPort: metrics ? 0 : undefined,
          addressLimits,
          clientErrorLimits,
          devTools,
          heartbeatIntervalMs,
          maxBufferedBytes,
          random
        })
    return new InProcessServer(app, clock, await app.listen(0), logs)
  }

  /** Every line the server has logged, parsed. */
  get logLines(): readonly LogLine[] {
    return this.logs.lines
  }

  /** The events the server has logged, in order. */
  get logEvents(): readonly LogLine[] {
    return this.logs.events
  }

  /** The metrics the server serves, as Prometheus text. */
  async scrapeMetrics(): Promise<string> {
    const address = this.app.metricsAddress()
    if (!address) throw new Error("the server was not started with metrics")
    const response = await fetch(`${address}/metrics`)
    return response.text()
  }

  /** A browser reporting an error, from this address; the status it is answered with. */
  async postClientError(body: unknown, address?: string): Promise<number> {
    const response = await fetch(`${this.httpUrl}${CLIENT_ERRORS_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(address ? { "fly-client-ip": address } : {}) },
      body: JSON.stringify(body)
    })
    return response.status
  }

  /** A player who can connect to this server. */
  player(name: string): TestPlayer {
    const player = new TestPlayer(this, name)
    this.players.push(player)
    return player
  }

  /** A player who has opened a game and is in its lobby. */
  async host(name: string, code?: RoomCode): Promise<TestPlayer> {
    const player = this.player(name)
    await player.host(code)
    await player.expectLobby()
    return player
  }

  /** Why each state a player was sent did not match the schema the client trusts. */
  get invalidStates(): string[] {
    return this.players.flatMap((player) => player.invalidStates)
  }

  /** Move the clock past the end of the round being guessed. */
  passDeadline(code: RoomCode = this.requireOnlyCode()): void {
    this.clock.advance((this.requireGame(code).config.roundLength ?? 0) + ROUND_GRACE)
  }

  /** The question being guessed, with its answer. */
  questionOf(code: RoomCode = this.requireOnlyCode()): Question {
    const question = this.requireGame(code).questionBeingGuessed
    if (!question) throw new Error(`game ${code} is not asking a question`)
    return question
  }

  /** Where the question being guessed has its answer. */
  answerTo(code?: RoomCode): LatLon {
    return answerCentre(this.questionOf(code).answer)
  }

  async untilNobodyConnected(code: RoomCode): Promise<void> {
    await eventually(
      () => this.requireGame(code).connectedCount === 0,
      () => `the server to see everyone in ${code} go`
    )
  }

  async untilGameFreed(code: RoomCode): Promise<void> {
    await eventually(
      () => this.game(code) === undefined,
      () => `game ${code} to be freed`
    )
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

  /** Seat spectators the same way. */
  watch(code: RoomCode, names: string[]): PlayerToken[] {
    let tokens: PlayerToken[] = []
    this.act(code, (game, now) => {
      tokens = seatPlayers(game, names, now, Role.SPECTATOR)
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

  /** A player's connection arriving through a proxy that names the client's address. */
  connectFrom(address: string, player: TestPlayer, code: RoomCode): RawSocket {
    return new RawSocket(this.socketUrl, player, joinEntry(code), { address })
  }

  /** A player's connection from a page on another site. */
  connectFromOrigin(origin: string, player: TestPlayer, code: RoomCode): RawSocket {
    return new RawSocket(this.socketUrl, player, joinEntry(code), { origin })
  }

  /** A player's connection that can later stop answering pings or stop reading. */
  connectStallable(player: TestPlayer, code: RoomCode): RawSocket {
    return new RawSocket(this.socketUrl, player, joinEntry(code))
  }

  /** A player behind this address opens a game and drops the connection as soon as it is open. */
  hostAndDrop(address: string, player: TestPlayer): void {
    new RawSocket(this.socketUrl, player, { type: GameEntryType.HOST }, { address }).drop()
  }

  /** Keep trying to come in from this address, until the server has freed what an earlier connection held. */
  async connectWhenAddressFree(address: string, player: TestPlayer, code: RoomCode): Promise<RawSocket> {
    const start = Date.now()
    for (;;) {
      const socket = this.connectFrom(address, player, code)
      try {
        await socket.expectInGame()
        return socket
      } catch (error) {
        if (Date.now() - start > 3000) throw new Error(`${address} was never let in`, { cause: error })
      }
    }
  }

  async untilGameCount(count: number): Promise<void> {
    await eventually(
      () => [...this.app.rivalis.rooms.keys()].length === count,
      () => `${count} games to be open; ${[...this.app.rivalis.rooms.keys()].join(", ")} are`
    )
  }

  /** From now on this game's timer fails when it fires. */
  breakTimer(code: RoomCode): void {
    const game = this.game(code)
    if (!game) throw new Error(`no game ${code}`)
    game.tick = () => {
      throw new Error("the game's tick failed")
    }
  }

  /** Send the game's players its state, over and over, until `done`. */
  async keepBroadcasting(code: RoomCode, done: () => boolean): Promise<void> {
    for (let batch = 0; !done(); batch++) {
      if (batch > 500) throw new Error("gave up broadcasting")
      for (let count = 0; count < 50; count++) this.act(code, () => undefined)
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
  }

  /** Disconnect the players this server made, and stop. */
  async close(): Promise<void> {
    await this.app.close()
    for (const player of this.players) player.disconnect()
  }

  private command(code: RoomCode, run: (game: Game, now: Instant) => CommandResult): void {
    this.act(code, (game, now) => {
      const result = run(game, now)
      if (!result.ok) throw new Error(`command refused: ${result.error}`)
    })
  }

  private requireOnlyCode(): RoomCode {
    const code = this.onlyCode
    if (!code) throw new Error("no game hosted, or more than one")
    return code
  }

  private requireGame(code: RoomCode): Game {
    const game = this.game(code)
    if (!game) throw new Error(`no game ${code}`)
    return game
  }

  private room(code: RoomCode): GameRoom | undefined {
    const room = this.app.rivalis.rooms.get(code)
    return room instanceof GameRoom ? room : undefined
  }
}

const joinEntry = (code: RoomCode): GameEntry => ({ type: GameEntryType.JOIN, code, role: Role.PLAYER })
