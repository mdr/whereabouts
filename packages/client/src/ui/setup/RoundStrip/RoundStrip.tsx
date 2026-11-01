import { mixTotal, type QuestionMix } from "@whereabouts/shared/protocol/config"
import { QUESTION_TYPES } from "@whereabouts/shared/questions"
import { typeColour } from "../../../question-types"
import { cx } from "../../cx"
import { describeMix } from "../describe-mix"
import { roundStripTestIds } from "./RoundStripTestIds"
import styles from "./RoundStrip.module.css"

/**
 * One cell per round, coloured by type, with the total unless `total` is
 * false; `centred` in a tile. The real order is shuffled.
 */
export const RoundStrip = ({
  mix,
  total = true,
  centred
}: {
  mix: QuestionMix
  total?: boolean
  centred?: boolean
}) => {
  const rounds = mixTotal(mix)
  return (
    <div class={cx(styles.strip, centred && styles.centred)} data-testid={roundStripTestIds.strip}>
      <div class={styles.cells} role="img" aria-label={describeMix(mix)}>
        {QUESTION_TYPES.flatMap((type) =>
          Array.from({ length: mix[type] }, (_, i) => (
            <span
              key={`${type}${i}`}
              class={styles.cell}
              style={typeColour(type)}
              data-testid={roundStripTestIds.cell}
            />
          ))
        )}
      </div>
      {total && (
        <span class={styles.stripText}>
          {rounds} {rounds === 1 ? "round" : "rounds"}, in a random order
        </span>
      )}
    </div>
  )
}
