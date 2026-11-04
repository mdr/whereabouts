import { MAX_PLAYERS } from "@whereabouts/shared/protocol/config"
import type { GameView } from "@whereabouts/shared/protocol/views"

/** A watcher can ask for a seat while one is free and the connection is up. */
export const canTakeSeat = (view: Pick<GameView, "players">, online: boolean): boolean =>
  view.players.length < MAX_PLAYERS && online

/** Why the seat is off, when every seat is taken. */
export const seatsTakenTitle = (view: Pick<GameView, "players">): string | undefined =>
  view.players.length >= MAX_PLAYERS ? `All ${MAX_PLAYERS} player seats are taken` : undefined

/** The host can start once a player is here and the connection is up; seats held for players away don't count. */
export const canStart = (view: Pick<GameView, "players">, online: boolean): boolean =>
  online && view.players.some((player) => player.connected)
