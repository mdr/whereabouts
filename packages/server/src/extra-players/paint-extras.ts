import type { Game } from "@whereabouts/shared/game/game"
import type { Instant } from "@whereabouts/shared/units"
import { scatteredPaint } from "./scattered-paint.ts"
import { seatedTokens } from "./seat-players.ts"

/** Every seated player paints near the answer and locks in; returns how many did. */
export const paintAndLockExtras = (game: Game, now: Instant, random: () => number): number => {
  const question = game.questionBeingGuessed
  if (!question) return 0
  const tokens = seatedTokens(game)
  for (const token of tokens) {
    game.setPaint(token, scatteredPaint(question, random))
    game.lock(token, now)
  }
  return tokens.length
}
