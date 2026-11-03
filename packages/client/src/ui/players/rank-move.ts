import type { PlayingPlayerView } from "@whereabouts/shared/roles"

export enum RankMove {
  UP = "UP",
  DOWN = "DOWN",
  SAME = "SAME"
}

/** How a player's rank changed over the last round; no earlier rank counts as unchanged. */
export const rankMove = (player: Pick<PlayingPlayerView, "rank" | "previousRank">): RankMove => {
  const delta = player.previousRank === undefined ? 0 : player.previousRank - player.rank
  return delta > 0 ? RankMove.UP : delta < 0 ? RankMove.DOWN : RankMove.SAME
}
