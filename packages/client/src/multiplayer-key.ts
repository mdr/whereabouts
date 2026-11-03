import { GameEntryType, type GameEntry } from "@whereabouts/shared/protocol/ticket"

/**
 * Changes whenever a game is entered anew, even to the same kind of entry:
 * hosting again from a game that began at #/game/new keeps its route.
 */
export const multiplayerKey = (visit: number, entry: GameEntry): string =>
  `${visit}:${entry.type === GameEntryType.HOST ? "new" : "join"}:${entry.code ?? ""}`
