import { cx } from "../../cx"
import { rankArrowTestIds } from "./RankArrowTestIds"
import s from "../Players.module.css"

/** ▲ or ▼ as a player's rank moved. */
export function RankArrow({ delta }: { delta: number }) {
  return (
    <span class={cx(s.arrow, delta > 0 && s.up, delta < 0 && s.down)} data-testid={rankArrowTestIds.arrow}>
      {delta > 0 ? "▲" : delta < 0 ? "▼" : ""}
    </span>
  )
}
