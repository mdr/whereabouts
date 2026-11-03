/**
 * A player at a keyboard: steps say what the player does and wait for the
 * server to answer, expectations say what the player sees. The protocol level
 * is `wire`, for tests about the protocol itself.
 */
import { ClientTopic } from "@whereabouts/shared/protocol/client-messages"
import type { GameConfig } from "@whereabouts/shared/protocol/config"
import { GameEntryType, type GameEntry } from "@whereabouts/shared/protocol/ticket"
import { viewIn, type GameViewIn } from "@whereabouts/shared/game/view-in"
import { compactRecord } from "@whereabouts/shared/paint/compact"
import { resolutionForTolerance } from "@whereabouts/shared/paint/paint"
import { regionCells, scoredAnswer } from "@whereabouts/shared/scoring/regions"
import { AnswerType } from "@whereabouts/shared/questions"
import type { HintAxis } from "@whereabouts/shared/hints"
import type { LatLon } from "@whereabouts/shared/geo"
import {
  playerName,
  playerToken,
  type PlayerId,
  type PlayerName,
  type PlayerToken,
  type RoomCode
} from "@whereabouts/shared/ids"
import { Role, YouRoleType, everyone, type PlayerView, type PlayingPlayerView } from "@whereabouts/shared/roles"
import { type GameView, type PaintSubmission, Phase } from "@whereabouts/shared/protocol/views"
import type { Km, Ms } from "@whereabouts/shared/units"
import { blobPaint } from "../extra-players/blob-paint.ts"
import { BANK } from "../rooms.ts"
import { eventually } from "./eventually.ts"
import { Refused } from "./refused.ts"
import { RevealReading } from "./reveal-reading.ts"
import type { InProcessServer } from "./in-process-server.ts"
import { Wire } from "./wire.ts"

const lockedIn = (view: GameView): boolean =>
  (view.phase === Phase.GUESSING || view.phase === Phase.REVEAL) &&
  view.you.role.type === YouRoleType.PLAYING &&
  view.you.role.locked

const sameNames = (view: GameView, names: string[]): boolean =>
  JSON.stringify(view.players.map((player) => player.name).sort()) === JSON.stringify([...names].sort())

const opposite = (at: LatLon): LatLon => ({ lat: 0 - at.lat, lon: at.lon > 0 ? at.lon - 180 : at.lon + 180 })

export class TestPlayer {
  readonly name: PlayerName
  readonly token: PlayerToken
  /** The protocol level of the current connection: for tests about the protocol itself. */
  wire: Wire
  private readonly server: InProcessServer
  private readonly wires: Wire[]

  constructor(server: InProcessServer, name: string) {
    this.server = server
    this.name = playerName(name)
    this.token = playerToken(`${name}-token-0123456789abcdef`)
    this.wire = new Wire(server.socketUrl, this.name, this.token)
    this.wires = [this.wire]
  }

  /** Why each state the server sent did not match the schema the client trusts. */
  get invalidStates(): string[] {
    return this.wires.flatMap((wire) => wire.invalidStates.map((why) => `${this.name}: ${why}`))
  }

  /** What the player's screen shows now. */
  get view(): GameView {
    const view = this.wire.latest
    if (!view) throw new Error(`${this.name} has seen no game`)
    return view
  }

  get code(): RoomCode {
    return this.view.code
  }

  get id(): PlayerId {
    return this.view.you.id
  }

  /** A seat as this player's screen shows it. */
  seatOf(player: TestPlayer): PlayerView {
    const seat = everyone(this.view).find((candidate) => candidate.name === player.name)
    if (!seat) throw new Error(`${this.name} sees no ${player.name}`)
    return seat
  }

  idOf(player: TestPlayer): PlayerId {
    return this.seatOf(player).id
  }

  playingSeatOf(player: TestPlayer): PlayingPlayerView {
    const seat = this.seatOf(player)
    if (seat.type !== Role.PLAYER) throw new Error(`${player.name} is not playing`)
    return seat
  }

  // Steps

  /** Open a game, or join the one under this code. */
  async host(code?: RoomCode): Promise<void> {
    await this.enter({ type: GameEntryType.HOST, ...(code ? { code } : {}) })
  }

  /** Come in by code: returns once the game is on screen or the server has shut the player out. */
  async join(code: RoomCode, role = Role.PLAYER): Promise<void> {
    await this.enter({ type: GameEntryType.JOIN, code, role })
  }

  /** Called by a host: a new player joins, and both see each other. */
  async invite(name: string): Promise<TestPlayer> {
    const guest = this.server.player(name)
    await guest.join(this.code)
    await this.expectSeeing(guest)
    await guest.expectSeeing(this)
    return guest
  }

  async start(): Promise<void> {
    await this.act(
      () => this.wire.send(ClientTopic.START),
      (view) => view.phase === Phase.GUESSING,
      "the round"
    )
  }

  async setMix(mix: GameConfig["mix"]): Promise<void> {
    await this.act(
      () => this.wire.send(ClientTopic.CONFIGURE, { mix }),
      (view) => Object.entries(mix).every(([type, count]) => view.config.mix[type as keyof typeof mix] === count),
      "the new mix"
    )
  }

  /** Paint an even blob around a place, by default as wide as the question's tolerance. */
  async paintAt(at: LatLon, radius?: Km): Promise<PaintSubmission> {
    const { tolerance } = viewIn(this.view, Phase.GUESSING).round.question.answer
    return this.paint(blobPaint(tolerance, at, radius ?? tolerance / 2))
  }

  async paintOnAnswer(): Promise<PaintSubmission> {
    return this.paintAt(this.server.answerTo(this.code))
  }

  async paintFarFromAnswer(): Promise<PaintSubmission> {
    return this.paintAt(opposite(this.server.answerTo(this.code)))
  }

  /** Paint exactly the area the question asks for, compacted the way the client sends paint. */
  async paintAnswerArea(): Promise<PaintSubmission> {
    const { answer } = this.server.questionOf(this.code)
    const area = scoredAnswer(answer, BANK.outlines)
    if (area.type !== AnswerType.AREA) throw new Error("the question does not ask for an area")
    const resolution = resolutionForTolerance(answer.tolerance)
    const cells = compactRecord(Object.fromEntries(regionCells(area, resolution).map((cell) => [cell, 1])))
    return this.paint({ cells, floor: 0.05 })
  }

  async lockIn(): Promise<void> {
    await this.act(
      () => this.wire.send(ClientTopic.LOCK),
      (view) => view.phase === Phase.REVEAL || lockedIn(view),
      "the guess locked in"
    )
  }

  async unlock(): Promise<void> {
    await this.act(
      () => this.wire.send(ClientTopic.UNLOCK),
      (view) => !lockedIn(view),
      "the guess unlocked"
    )
  }

  async hint(axis: HintAxis): Promise<void> {
    await this.act(
      () => this.wire.send(ClientTopic.HINT, { axis }),
      (view) => (view.phase === Phase.GUESSING || view.phase === Phase.REVEAL) && view.you.hint !== undefined,
      "the hint"
    )
  }

  /** Called by a host at a reveal. */
  async next(): Promise<void> {
    await this.act(
      () => this.wire.send(ClientTopic.NEXT),
      (view) => view.phase !== Phase.REVEAL,
      "the next round"
    )
  }

  async ready(): Promise<void> {
    const id = this.id
    await this.act(
      () => this.wire.send(ClientTopic.READY),
      (view) => view.phase !== Phase.REVEAL || view.reveal.ready.includes(id),
      "ready"
    )
  }

  async endGame(): Promise<void> {
    await this.act(
      () => this.wire.send(ClientTopic.END),
      (view) => view.phase === Phase.RESULTS,
      "the results"
    )
  }

  async playAgain(): Promise<void> {
    await this.act(
      () => this.wire.send(ClientTopic.AGAIN),
      (view) => view.phase === Phase.LOBBY,
      "the lobby"
    )
  }

  async rename(name: string): Promise<void> {
    await this.act(
      () => this.wire.send(ClientTopic.RENAME, { name: playerName(name) }),
      (view) => view.you.name === name,
      `the name ${name}`
    )
  }

  async handHostTo(player: TestPlayer): Promise<void> {
    const playerId = this.idOf(player)
    await this.act(
      () => this.wire.send(ClientTopic.MAKE_HOST, { playerId }),
      (view) => !view.you.isHost,
      "the host role handed over"
    )
  }

  async remove(player: TestPlayer): Promise<void> {
    const playerId = this.idOf(player)
    await this.act(
      () => this.wire.send(ClientTopic.KICK, { playerId }),
      (view) => !everyone(view).some((seat) => seat.id === playerId),
      `${player.name} removed`
    )
  }

  /** A spectator sits down as a player. */
  async takeSeat(): Promise<void> {
    await this.act(
      () => this.wire.send(ClientTopic.SET_ROLE, { role: Role.PLAYER }),
      (view) => view.you.role.type === YouRoleType.PLAYING,
      "a seat"
    )
  }

  /** Give up the seat: the server closes the connection, or refuses. */
  async leave(): Promise<void> {
    const { wire } = this
    const errorsBefore = wire.errors.length
    wire.send(ClientTopic.LEAVE)
    await eventually(
      () => {
        const refusal = wire.errors[errorsBefore]
        if (refusal !== undefined) throw new Refused(refusal)
        return wire.closed
      },
      () => `${this.name}'s connection to close`
    )
  }

  /** Watch instead of play. */
  async watch(): Promise<void> {
    await this.act(
      () => this.wire.send(ClientTopic.SET_ROLE, { role: Role.SPECTATOR }),
      (view) => view.you.role.type === YouRoleType.SPECTATOR,
      "watching"
    )
  }

  /** The connection drops, as when a tab closes. */
  disconnect(): void {
    this.wire.client.disconnect()
  }

  /** Come back to the game as the same player, on a new connection. */
  async reconnect(): Promise<void> {
    await this.join(this.code)
  }

  // Expectations

  async expectPhase(phase: Phase): Promise<GameView> {
    return this.untilView(`the ${phase} phase`, (view) => view.phase === phase)
  }

  async expectLobby(): Promise<GameViewIn<Phase.LOBBY>> {
    return viewIn(await this.expectPhase(Phase.LOBBY), Phase.LOBBY)
  }

  async expectLobbyWith(names: string[]): Promise<GameViewIn<Phase.LOBBY>> {
    const view = await this.untilView(
      `the lobby with ${names.join(", ")}`,
      (candidate) => candidate.phase === Phase.LOBBY && sameNames(candidate, names)
    )
    return viewIn(view, Phase.LOBBY)
  }

  async expectGuessing(roundIndex?: number): Promise<GameViewIn<Phase.GUESSING>> {
    const view = await this.untilView(
      `round ${roundIndex ?? "any"} to be guessed`,
      (candidate) =>
        candidate.phase === Phase.GUESSING && (roundIndex === undefined || candidate.round.index === roundIndex)
    )
    return viewIn(view, Phase.GUESSING)
  }

  async expectReveal(roundIndex?: number): Promise<RevealReading> {
    const view = await this.untilView(
      `round ${roundIndex ?? "any"} to be revealed`,
      (candidate) =>
        candidate.phase === Phase.REVEAL && (roundIndex === undefined || candidate.reveal.index === roundIndex)
    )
    return new RevealReading(viewIn(view, Phase.REVEAL))
  }

  async expectResults(): Promise<GameViewIn<Phase.RESULTS>> {
    return viewIn(await this.expectPhase(Phase.RESULTS), Phase.RESULTS)
  }

  /** Reveal with this many players ready. */
  async expectReadyCount(count: number): Promise<void> {
    await this.untilView(`${count} ready`, (view) => view.phase === Phase.REVEAL && view.reveal.ready.length === count)
  }

  async expectHost(): Promise<void> {
    await this.untilView("the host role", (view) => view.you.isHost)
  }

  async expectNotHost(): Promise<void> {
    await this.untilView("someone else to host", (view) => !view.you.isHost)
  }

  /** Everyone in the game, players and spectators, counted. */
  async expectHeadcount(count: number): Promise<GameView> {
    return this.untilView(`${count} people`, (view) => everyone(view).length === count, 10_000)
  }

  /** A player or spectator of this name, connected. */
  async expectSeeing(player: TestPlayer | string): Promise<GameView> {
    const name = typeof player === "string" ? player : player.name
    return this.untilView(`${name} in the game`, (view) =>
      everyone(view).some((seat) => seat.name === name && seat.connected)
    )
  }

  async expectGone(player: TestPlayer): Promise<void> {
    await this.untilView(`${player.name} gone`, (view) => !everyone(view).some((seat) => seat.name === player.name))
  }

  async expectOffline(player: TestPlayer | string): Promise<void> {
    const name = typeof player === "string" ? player : player.name
    await this.untilView(`${name} offline`, (view) =>
      everyone(view).some((seat) => seat.name === name && !seat.connected)
    )
  }

  async expectEveryoneConnected(): Promise<GameView> {
    return this.untilView("everyone connected", (view) => everyone(view).every((seat) => seat.connected))
  }

  /** The server closes the connection, with this reason if one is given. */
  async expectClosedFor(reason?: string): Promise<void> {
    await this.expectClosed()
    if (reason !== undefined && this.wire.closedFor !== reason)
      throw new Error(`${this.name}: closed for ${this.wire.closedFor}, not ${reason}`)
  }

  async expectClosed(): Promise<void> {
    await eventually(
      () => this.wire.closed,
      () => `${this.name}'s connection to close`
    )
  }

  expectNeverSawGame(): void {
    if (this.wire.states.length > 0) throw new Error(`${this.name} saw a game`)
  }

  expectStillConnected(): void {
    if (this.wire.closed) throw new Error(`${this.name} was disconnected`)
  }

  /** The player's screen does not carry this paint. */
  expectNotShown(paint: PaintSubmission): void {
    const cell = Object.keys(paint.cells)[0]
    if (cell !== undefined && JSON.stringify(this.view).includes(cell))
      throw new Error(`${this.name} was shown ${cell}`)
  }

  // Internals

  private async enter(entry: GameEntry): Promise<void> {
    if (this.wire.used) {
      this.wire = new Wire(this.server.socketUrl, this.name, this.token)
      this.wires.push(this.wire)
    }
    const { wire } = this
    wire.connect(entry)
    await eventually(
      () => wire.states.length > 0 || wire.closed,
      () => `${this.name} to enter the game`
    )
  }

  private async paint(paint: PaintSubmission): Promise<PaintSubmission> {
    const code = this.code
    this.wire.sendPaint(paint)
    await eventually(
      () => this.server.game(code)?.paintOf(this.token) !== undefined,
      () => `${this.name}'s paint to reach the server`
    )
    return paint
  }

  /** Send, then wait for the screen to show the step took effect; a refusal from the server fails the step. */
  private async act(send: () => void, acknowledged: (view: GameView) => boolean, what: string): Promise<void> {
    const { wire } = this
    const errorsBefore = wire.errors.length
    const statesBefore = wire.states.length
    send()
    await eventually(
      () => {
        const refusal = wire.errors[errorsBefore]
        if (refusal !== undefined) throw new Refused(refusal)
        const view = wire.latest
        return wire.states.length > statesBefore && view !== undefined && acknowledged(view)
      },
      () => `${this.name} to see ${what}`
    )
  }

  private async untilView(what: string, matches: (view: GameView) => boolean, ms?: Ms): Promise<GameView> {
    const { wire } = this
    await eventually(
      () => {
        const view = wire.latest
        return view !== undefined && matches(view)
      },
      () => `${this.name} to see ${what}; last=${JSON.stringify(wire.latest).slice(0, 300)}`,
      ms
    )
    return this.view
  }
}
