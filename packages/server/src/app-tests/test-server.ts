/**
 * End-to-end over a real WebSocket: boots the Fastify + Rivalis app on a
 * random port and drives it with the same browser client the real UI uses.
 * Node 22 provides global WebSocket, TextEncoder and URL; the client reads
 * them from `window`, so the test aliases window to globalThis.
 */
import { afterEach, beforeEach } from "vite-plus/test"
import type { WSClient as WSClientType } from "@rivalis/browser"
import { viewIn } from "@whereabouts/shared/game/view-in"
import { PaintLayer, resolutionForTolerance } from "@whereabouts/shared/paint/paint"
import { PROTOCOL_VERSION, encodeTicket, type GameEntry, GameEntryType } from "@whereabouts/shared/protocol/ticket"
import { type ClientSend, type ClientTopic } from "@whereabouts/shared/protocol/client-messages"
import { mixOf } from "@whereabouts/shared/protocol/config"
import {
  revealFrom,
  viewFrom,
  type RevealMessage,
  type StateMessage
} from "@whereabouts/shared/protocol/server-messages"
import { type GameView, type PaintSubmission, type RoundReveal, Phase } from "@whereabouts/shared/protocol/views"
import { decodePaint, encodePaint } from "@whereabouts/shared/paint/paint-wire"
import { GameViewSchema } from "@whereabouts/shared/protocol/view-schema"
import { CATALOGUE } from "@whereabouts/shared/catalogue/catalogue"
import {
  placeId,
  playerToken,
  questionId,
  playerName,
  wikiTitle,
  type PlayerName,
  type PlayerToken,
  type RoomCode
} from "@whereabouts/shared/ids"
import {
  AnswerType,
  ClueType,
  QuestionType,
  promptOf,
  type PlaceQuestion,
  type Question
} from "@whereabouts/shared/questions"
import { createApp, type App } from "../app.ts"
import { BANK, configureGameRooms, realClock, type Clock } from "../rooms.ts"
import { Role, YouRoleType } from "@whereabouts/shared/roles"
import type { AddressLimits } from "../address-limiter.ts"

// Static imports hoist above this line, so the client is loaded dynamically.
;(globalThis as unknown as { window: unknown }).window = globalThis
const { WSClient } = await import("@rivalis/browser")

export const lockedIn = (view: GameView) =>
  (view.phase === Phase.GUESSING || view.phase === Phase.REVEAL) &&
  view.you.role.type === YouRoleType.PLAYING &&
  view.you.role.locked

const place = (id: string, label: string, lat: number, lon: number, tolerance: number): PlaceQuestion => ({
  type: QuestionType.PLACE,
  id: questionId(id),
  place: placeId(id),
  label,
  wiki: wikiTitle(label),
  clue: { type: ClueType.NAME, prompt: `Where is ${label}?` },
  answer: { type: AnswerType.POINT, at: { lat, lon }, tolerance }
})

const questions = [place("petra", "Petra", 30.3285, 35.4444, 200), place("paris", "Paris", 48.8566, 2.3522, 100)]
/** Two known place names, and the real questions of the other types. */
const bank = {
  ...BANK,
  catalogue: [...questions, ...CATALOGUE.filter((question) => question.type !== QuestionType.PLACE)]
}
export const config = { mix: mixOf({ [QuestionType.PLACE]: 2 }), roundLength: 60_000 }

/** The place question a round asked. */
export const askedIn = (round: GameView) =>
  questions.find((question) => promptOf(question) === promptOf(viewIn(round, Phase.GUESSING).round.question))!

/** Real timers, but time can be jumped forward so deadlines fire immediately. */
class FakeClock implements Clock {
  offset = 0
  private pending = new Map<number, { at: number; fn: () => void }>()
  private seq = 0
  now() {
    return Date.now() + this.offset
  }
  setTimeout(fn: () => void, ms: number) {
    const id = ++this.seq
    this.pending.set(id, { at: this.now() + ms, fn })
    return id
  }
  clearTimeout(handle: unknown) {
    this.pending.delete(handle as number)
  }
  /** Jump forward and fire everything now due, in order. */
  advance(ms: number) {
    this.offset += ms
    const due = [...this.pending.entries()]
      .filter(([, timer]) => timer.at <= this.now())
      .sort((a, b) => a[1].at - b[1].at)
    for (const [id, timer] of due) {
      this.pending.delete(id)
      timer.fn()
    }
  }
}

type Topics = "state" | "reveal" | "paint" | "error" | "pong"

export const host = (code?: RoomCode): GameEntry => ({ type: GameEntryType.HOST, ...(code ? { code } : {}) })
export const join = (code: RoomCode, role = Role.PLAYER): GameEntry => ({ type: GameEntryType.JOIN, code, role })

export class TestPlayer {
  readonly client: WSClientType<Topics>
  /** Views as the client puts them together from state, reveal and paint messages. */
  readonly states: GameView[] = []
  readonly rawStates: string[] = []
  readonly reveals: RoundReveal[] = []
  readonly errors: string[] = []
  /** Why each state message that did not match GameViewSchema failed: checked after every test. */
  readonly invalidStates: string[] = []
  readonly token: PlayerToken
  readonly name: PlayerName
  /** The reason the server gave for closing the connection, if it did. */
  closedFor: string | undefined = undefined
  constructor(url: string, name: string) {
    this.name = playerName(name)
    this.token = playerToken(`${name}-token-0123456789abcdef`)
    this.client = new WSClient<Topics>(url, { ticketSource: "protocol", reconnect: false })
    const decoder = new TextDecoder()
    let reveal: RoundReveal | undefined = undefined
    let paint: PaintSubmission | undefined = undefined
    this.client.on("reveal", (testPlayer) => {
      reveal = revealFrom(JSON.parse(decoder.decode(testPlayer)) as RevealMessage)
      this.reveals.push(reveal)
    })
    this.client.on("paint", (testPlayer) => {
      paint = decodePaint(testPlayer)
    })
    this.client.on("state", (testPlayer) => {
      const raw = decoder.decode(testPlayer)
      const state = JSON.parse(raw) as StateMessage
      if (state.phase !== Phase.REVEAL) reveal = undefined
      if (state.phase !== Phase.GUESSING) paint = undefined
      const view = viewFrom(state, reveal, paint)
      this.rawStates.push(raw)
      if (!view) {
        this.invalidStates.push("a reveal state came before its reveal")
        return
      }
      const checked = GameViewSchema.safeParse(view)
      if (!checked.success) this.invalidStates.push(checked.error.message)
      this.states.push(view)
    })
    this.client.on("client:kicked", ({ reason }) => (this.closedFor = reason))
    this.client.on("error", (payload) =>
      this.errors.push((JSON.parse(decoder.decode(payload)) as { message: string }).message)
    )
  }
  connect(entry: GameEntry) {
    this.client.connect(encodeTicket({ v: PROTOCOL_VERSION, token: this.token, name: this.name, entry }))
  }
  send<K extends ClientTopic>(...[topic, body]: ClientSend<K>) {
    this.client.send(topic, JSON.stringify(body ?? {}))
  }
  sendPaint(paint: PaintSubmission) {
    this.client.send("paint", encodePaint(paint))
  }
  get latest(): GameView {
    return this.states[this.states.length - 1]!
  }
  /** Wait until a state arrives that satisfies the predicate. */
  async until(pred: (view: GameView) => boolean, ms = 3000): Promise<GameView> {
    const start = Date.now()
    while (Date.now() - start < ms) {
      const hit = this.states.find(pred)
      if (hit) return hit
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error(
      `${this.name}: no state matched within ${ms}ms; last=${JSON.stringify(this.states.at(-1)).slice(0, 300)}`
    )
  }
  async untilLatest(pred: (view: GameView) => boolean, ms = 3000): Promise<GameView> {
    const start = Date.now()
    while (Date.now() - start < ms) {
      if (this.states.length && pred(this.latest)) return this.latest
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error(`${this.name}: latest never matched; last=${JSON.stringify(this.states.at(-1)).slice(0, 300)}`)
  }
  async waitClosed(ms = 3000): Promise<void> {
    await eventually(() => !this.client.connected, `${this.name}'s connection to close`, ms)
  }
}

/** Wait until `done` holds, failing with what was awaited. */
export const eventually = async (done: () => boolean, what: string, ms = 3000): Promise<void> => {
  const start = Date.now()
  while (!done()) {
    if (Date.now() - start > ms) throw new Error(`gave up waiting ${ms}ms for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

export const paintAt = (question: Question, lat: number, lon: number) => {
  const { tolerance } = question.answer
  const layer = new PaintLayer(resolutionForTolerance(tolerance))
  layer.stamp({ lat, lon }, tolerance / 2, 1)
  return { cells: layer.toRecord(), floor: 0.05 }
}

export const pollErrors = async (testPlayer: TestPlayer, ms = 2000): Promise<string[]> => {
  const start = Date.now()
  while (testPlayer.errors.length === 0 && Date.now() - start < ms)
    await new Promise((resolve) => setTimeout(resolve, 10))
  return testPlayer.errors
}

/** Boots the app on a random port around each test, with a fake clock; checks every state sent against GameViewSchema afterwards. */
export const useGameServer = ({ addressLimits }: { addressLimits?: AddressLimits } = {}) => {
  let app: App
  let url: string
  let clock: FakeClock
  const players: TestPlayer[] = []

  beforeEach(async () => {
    clock = new FakeClock()
    configureGameRooms({ clock, bank, config })
    app = createApp({ staticDir: undefined, logLevel: "warning", addressLimits })
    const address = await app.listen(0)
    url = address.replace(/^http/, "ws") + "/ws"
  })

  afterEach(async () => {
    // Every state the server sent matched the schema the client's cast trusts.
    const invalid = players.flatMap((player) => player.invalidStates.map((why) => `${player.name}: ${why}`))
    if (invalid.length > 0) throw new Error(`state did not match GameViewSchema:\n${invalid.join("\n")}`)
    for (const testPlayer of players) testPlayer.client.disconnect()
    players.length = 0
    await app.close()
    configureGameRooms({ clock: realClock })
  })

  const player = (name: string) => {
    const testPlayer = new TestPlayer(url, name)
    players.push(testPlayer)
    return testPlayer
  }

  /** Alice hosting and Bob joined, both seen in the lobby. */
  const aliceAndBob = async () => {
    const alice = player("Alice")
    alice.connect(host())
    const { code } = await alice.until((view) => view.phase === Phase.LOBBY)
    const bob = player("Bob")
    bob.connect(join(code))
    const lobby = await alice.until((view) => view.players.length === 2)
    await bob.until((view) => view.players.length === 2)
    const bobId = lobby.players.find((player) => player.name === "Bob")!.id
    return { alice, bob, code, bobId }
  }

  // The app and clock are replaced for every test, so they are read through getters.
  return {
    get app() {
      return app
    },
    get clock() {
      return clock
    },
    player,
    aliceAndBob
  }
}
