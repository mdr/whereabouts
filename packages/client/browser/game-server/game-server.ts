/**
 * Browser tests against the real game server, in the test's own process
 * (see InProcessServer): `server` starts one for each test, `newTab` with
 * it sends that tab's game there, and `TestGame` sets games up and checks them.
 */
import { expect, test as base } from "@playwright/test"
import { InProcessServer, type InProcessOptions } from "../../../server/src/test-support/in-process-server.ts"
import type { Game } from "@whereabouts/shared/game/game"
import type { LatLon } from "@whereabouts/shared/geo"
import type { HintAxis } from "@whereabouts/shared/hints"
import type { PlayerToken, RoomCode } from "@whereabouts/shared/ids"
import type { Km, Ms } from "@whereabouts/shared/units"

export class TestGame {
  readonly server: InProcessServer

  constructor(server: InProcessServer) {
    this.server = server
  }

  /** Until the only game passes `check` (expect… calls), the way the server holds it. */
  async expectGame(check: (game: Game) => void, timeout: Ms = 5_000): Promise<void> {
    await expect(() => {
      const game = this.server.onlyGame
      expect(game, "a game is hosted").toBeDefined()
      check(game!)
    }).toPass({ timeout })
  }

  /** Seat players in the only game, with no tab behind them. */
  seat(names: string[]): PlayerToken[] {
    return this.server.seat(this.code, names)
  }

  /** A seated player paints a blob, `radius` across, around `at`. */
  paint(token: PlayerToken, at: LatLon, radius: Km): void {
    this.server.paint(this.code, token, at, radius)
  }

  /** Seated players press Done (a pass, with nothing painted). */
  lock(tokens: PlayerToken[]): void {
    tokens.forEach((token) => this.server.lock(this.code, token))
  }

  /** Seated players press Ready at the reveal. */
  ready(tokens: PlayerToken[]): void {
    tokens.forEach((token) => this.server.ready(this.code, token))
  }

  hint(token: PlayerToken, axis: HintAxis): void {
    this.server.hint(this.code, token, axis)
  }

  private get code(): RoomCode {
    const code = this.server.onlyCode
    if (!code) throw new Error("no game hosted, or more than one")
    return code
  }

  /** Move the server's clock on, so deadlines it was waiting for pass now. */
  advance(time: Ms): void {
    this.server.clock.advance(time)
  }
}

export const test = base.extend<{ serverOptions: InProcessOptions; game: TestGame }>({
  serverOptions: [{}, { option: true }],
  game: async ({ serverOptions }, use) => {
    const server = await InProcessServer.start(serverOptions)
    await use(new TestGame(server))
    await server.close()
  }
})
