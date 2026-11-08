import type { Lookalikes } from "@whereabouts/shared/catalogue/lookalike-flags"
import { useState } from "preact/hooks"
import { SmallFlag } from "../../../pictures/SmallFlag/SmallFlag"
import { cx } from "../../../cx"
import { flagLabel, lookalikesHeading } from "../../../../round/lookalike-words"
import { LookalikeCompare } from "../LookalikeCompare/LookalikeCompare"
import { lookalikeFlagsTestIds } from "./LookalikeFlagsTestIds"
import styles from "./LookalikeFlags.module.css"

/**
 * A flag round's look-alikes, each with what marks it apart: the answer's
 * first, then the one painted if it was one. Any flag opens them all large.
 */
export const LookalikeFlags = ({ lookalikes }: { lookalikes: Lookalikes }) => {
  const [comparing, setComparing] = useState(false)
  return (
    <div class={styles.lookalikes} data-testid={lookalikeFlagsTestIds.lookalikes}>
      <p class={styles.heading}>{lookalikesHeading(lookalikes)}</p>
      <ul class={styles.flags}>
        {lookalikes.flags.map(({ code, tip }, i) => (
          <li key={code} class={cx(styles.flag, i === 0 && styles.answer)} data-testid={lookalikeFlagsTestIds.flag}>
            <button
              type="button"
              class={styles.enlarge}
              title="Compare the flags larger"
              onClick={() => setComparing(true)}
              data-testid={lookalikeFlagsTestIds.enlarge}
            >
              <SmallFlag code={code} class={styles.picture} />
              <span class="sr-only">Compare the flags larger</span>
            </button>
            <span class={styles.text}>
              <span class={styles.name}>{flagLabel(code)}</span>
              <span class={styles.tip}>{tip}</span>
            </span>
          </li>
        ))}
      </ul>
      {comparing && <LookalikeCompare lookalikes={lookalikes} onClose={() => setComparing(false)} />}
    </div>
  )
}
