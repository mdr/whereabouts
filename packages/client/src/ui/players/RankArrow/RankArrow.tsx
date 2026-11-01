import { cx } from "../../cx"
import { rankArrowTestIds } from "./RankArrowTestIds"
import styles from "../Players.module.css"

/** ▲ or ▼ as a player's rank moved. */
export const RankArrow = ({ delta }: { delta: number }) => (
  <span class={cx(styles.arrow, delta > 0 && styles.up, delta < 0 && styles.down)} data-testid={rankArrowTestIds.arrow}>
    {delta > 0 ? "▲" : delta < 0 ? "▼" : ""}
  </span>
)
