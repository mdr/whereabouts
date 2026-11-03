import { mixTotal, type GameConfig } from "@whereabouts/shared/protocol/config"
import { QUESTION_TYPES } from "@whereabouts/shared/questions"

export enum SetupTileType {
  ROUNDS = "ROUNDS",
  SECONDS = "SECONDS",
  HINTS = "HINTS",
  QUESTIONS = "QUESTIONS",
  MAP_DETAIL = "MAP_DETAIL"
}

export interface SetupTile {
  type: SetupTileType.ROUNDS | SetupTileType.SECONDS | SetupTileType.HINTS
  value: string
  label: string
}

/** The numbers a guest sees at a glance: rounds, time per round, hints. */
export const setupTiles = ({ mix, roundLength, hints }: GameConfig): SetupTile[] => {
  const rounds = mixTotal(mix)
  return [
    { type: SetupTileType.ROUNDS, value: String(rounds), label: rounds === 1 ? "round" : "rounds" },
    {
      type: SetupTileType.SECONDS,
      value: roundLength === undefined ? "No limit" : `${roundLength / 1000} s`,
      label: "per round"
    },
    {
      type: SetupTileType.HINTS,
      value: hints === undefined ? "Unlimited" : String(hints),
      label: hints === 1 ? "hint each" : "hints each"
    }
  ]
}

/** The tiles whose value differs between two setups. */
export const changedSetup = (before: GameConfig, after: GameConfig): ReadonlySet<SetupTileType> => {
  const changed = new Set<SetupTileType>()
  if (mixTotal(after.mix) !== mixTotal(before.mix)) changed.add(SetupTileType.ROUNDS)
  if (after.roundLength !== before.roundLength) changed.add(SetupTileType.SECONDS)
  if (after.hints !== before.hints) changed.add(SetupTileType.HINTS)
  if (QUESTION_TYPES.some((type) => after.mix[type] !== before.mix[type])) changed.add(SetupTileType.QUESTIONS)
  if (after.mapDetail !== before.mapDetail) changed.add(SetupTileType.MAP_DETAIL)
  return changed
}
