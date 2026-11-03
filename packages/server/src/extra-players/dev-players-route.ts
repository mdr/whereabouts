import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { RoomCodeSchema } from "@whereabouts/shared/ids"
import { DEV_PLAYERS_PATH, DevPlayersAction } from "@whereabouts/shared/protocol/dev-players"
import { Phase } from "@whereabouts/shared/protocol/views"
import type { Game } from "@whereabouts/shared/game/game"
import type { Instant } from "@whereabouts/shared/units"
import { paintAndLockExtras } from "./paint-extras.ts"
import { seatPlayers } from "./seat-players.ts"

const DEFAULT_EXTRAS = 16

const BodySchema = z.object({
  code: RoomCodeSchema,
  action: z.enum(DevPlayersAction),
  count: z.int().min(1).max(24).optional()
})

type Outcome = { ok: true; changed: number } | { ok: false; error: string }

/** Changes the game with that code and sends its players the result; undefined if there is none. */
export type ActOnGame = (code: string, change: (game: Game, now: Instant) => Outcome) => Outcome | undefined

const apply = (game: Game, now: Instant, action: DevPlayersAction, count: number, random: () => number): Outcome => {
  if (action === DevPlayersAction.PAINT) {
    if (game.phase !== Phase.GUESSING) return { ok: false, error: "extra players paint while guessing only" }
    return { ok: true, changed: paintAndLockExtras(game, now, random) }
  }
  if (game.phase !== Phase.LOBBY) return { ok: false, error: "players can be added in the lobby only" }
  const first = game.playerCount + 1
  const names = Array.from({ length: count }, (_, i) => `Player ${first + i}`)
  try {
    return { ok: true, changed: seatPlayers(game, names, now).length }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Playtest tools: extra players with no connection, to look at a full room by hand. Development servers only. */
export const registerDevPlayers = (fastify: FastifyInstance, act: ActOnGame, random: () => number): void => {
  fastify.post(DEV_PLAYERS_PATH, (request, reply) => {
    const body = BodySchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: "invalid body" })
    const { code, action, count = DEFAULT_EXTRAS } = body.data
    const outcome = act(code, (game, now) => apply(game, now, action, count, random))
    if (!outcome) return reply.code(404).send({ error: "no such game" })
    if (!outcome.ok) return reply.code(409).send({ error: outcome.error })
    return { changed: outcome.changed }
  })
}
