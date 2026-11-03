import { Role, type PlayerView } from "@whereabouts/shared/roles"

export enum PlayerTag {
  HOST = "HOST",
  YOU = "YOU",
  OFFLINE = "OFFLINE",
  WATCHING = "WATCHING",
  DONE = "DONE"
}

export const PLAYER_TAG_TEXT: Record<PlayerTag, string> = {
  [PlayerTag.HOST]: "host",
  [PlayerTag.YOU]: "you",
  [PlayerTag.OFFLINE]: "offline",
  [PlayerTag.WATCHING]: "watching",
  [PlayerTag.DONE]: "done"
}

/**
 * The tags beside a player's name, in display order. A watcher is tagged
 * only where `markWatchers` says so: the lobby sets watchers apart already.
 */
export const playerTags = (
  player: PlayerView,
  { isYou, markWatchers, showLocked }: { isYou: boolean; markWatchers: boolean; showLocked: boolean }
): PlayerTag[] => [
  ...(player.isHost ? [PlayerTag.HOST] : []),
  ...(isYou ? [PlayerTag.YOU] : []),
  ...(!player.connected ? [PlayerTag.OFFLINE] : []),
  ...(player.type === Role.SPECTATOR && markWatchers ? [PlayerTag.WATCHING] : []),
  ...(showLocked && player.type === Role.PLAYER && player.locked ? [PlayerTag.DONE] : [])
]
