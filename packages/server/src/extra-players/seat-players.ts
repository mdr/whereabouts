import type { Game } from "@whereabouts/shared/game/game"
import { playerName, playerToken, type PlayerToken } from "@whereabouts/shared/ids"
import { Role } from "@whereabouts/shared/roles"
import type { Instant } from "@whereabouts/shared/units"

const SEATED_SUFFIX = "-seated-0123456789"

/** Seat players (or spectators) with no connection behind them, as if each had joined and kept still. */
export const seatPlayers = (game: Game, names: string[], now: Instant, role: Role = Role.PLAYER): PlayerToken[] => {
  const tokens = names.map((name) => playerToken(`${name}${SEATED_SUFFIX}`))
  names.forEach((name, i) => {
    const joined = game.join(tokens[i]!, playerName(name), now, role)
    if (!joined.ok) throw new Error(`${name} could not join: ${joined.reason}`)
  })
  return tokens
}

/** The players seated this way, not those who connected. */
export const seatedTokens = (game: Game): PlayerToken[] =>
  game.playerTokens.filter((token) => token.endsWith(SEATED_SUFFIX))
