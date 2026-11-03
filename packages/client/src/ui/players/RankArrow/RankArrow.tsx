import { cx } from "../../cx"
import { RankMove } from "../rank-move"
import { rankArrowTestIds } from "./RankArrowTestIds"
import styles from "../Players.module.css"

const GLYPH: Record<RankMove, string> = {
  [RankMove.UP]: "▲",
  [RankMove.DOWN]: "▼",
  [RankMove.SAME]: ""
}

/** ▲ or ▼ as a player's rank moved. */
export const RankArrow = ({ move }: { move: RankMove }) => (
  <span
    class={cx(styles.arrow, move === RankMove.UP && styles.up, move === RankMove.DOWN && styles.down)}
    data-testid={rankArrowTestIds.arrow}
    data-move={move}
  >
    {GLYPH[move]}
  </span>
)
