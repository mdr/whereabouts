import type { PaintedCountry } from "@whereabouts/shared/borders"
import { SmallFlag } from "../../../pictures/SmallFlag/SmallFlag"
import { cx } from "../../../cx"
import { paintedInTitle, paintedPercent } from "./painted-in-title"
import { paintedInTestIds } from "./PaintedInTestIds"
import styles from "./PaintedIn.module.css"

/**
 * Where some paint mostly was: "[flag] Peru 62%", marked when it is the
 * answer. `whose` names the painter for the title: "your", "Ann's".
 */
export const PaintedIn = ({ where, answer, whose }: { where: PaintedCountry; answer?: string; whose: string }) => {
  const right = where.country.clue.flag === answer
  return (
    <span
      class={cx(styles.paintedIn, right && styles.right)}
      data-testid={paintedInTestIds.paintedIn}
      title={paintedInTitle(where, answer, whose)}
    >
      <SmallFlag code={where.country.clue.flag} />
      <span class={styles.country}>{where.country.label}</span>
      <span class={styles.share}>{paintedPercent(where)}%</span>
    </span>
  )
}
