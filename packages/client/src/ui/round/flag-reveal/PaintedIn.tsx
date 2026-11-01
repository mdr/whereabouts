import type { PaintedCountry } from "@whereabouts/shared/borders"
import { SmallFlag } from "../../pictures/SmallFlag"
import { cx } from "../../cx"
import { paintedInTestIds } from "./PaintedInTestIds"
import s from "./PaintedIn.module.css"

/**
 * Where some paint mostly was: "[flag] Peru 62%", marked when it is the
 * answer. `whose` names the painter for the title: "your", "Ann's".
 */
export function PaintedIn({ where, answer, whose }: { where: PaintedCountry; answer?: string; whose: string }) {
  const pct = Math.round(where.share * 100)
  const right = where.country.clue.flag === answer
  return (
    <span
      class={cx(s.paintedIn, right && s.right)}
      data-testid={paintedInTestIds.paintedIn}
      title={`${pct}% of ${whose} paint was in ${where.country.label}${right ? ", the answer" : ""}`}
    >
      <SmallFlag code={where.country.clue.flag} />
      <span class={s.country}>{where.country.label}</span>
      <span class={s.share}>{pct}%</span>
    </span>
  )
}
