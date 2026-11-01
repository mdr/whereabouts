import { mixTotal, type QuestionMix } from "@whereabouts/shared/protocol"
import { QUESTION_TYPES } from "@whereabouts/shared/questions"
import { typeColour } from "../../../question-types"
import { cx } from "../../cx"
import { describeMix } from "../describe-mix"
import { roundStripTestIds } from "./RoundStripTestIds"
import s from "./RoundStrip.module.css"

/**
 * One cell per round, coloured by type, with the total unless `total` is
 * false; `centred` in a tile. The real order is shuffled.
 */
export function RoundStrip({ mix, total = true, centred }: { mix: QuestionMix; total?: boolean; centred?: boolean }) {
  const rounds = mixTotal(mix)
  return (
    <div class={cx(s.strip, centred && s.centred)} data-testid={roundStripTestIds.strip}>
      <div class={s.cells} role="img" aria-label={describeMix(mix)}>
        {QUESTION_TYPES.flatMap((t) =>
          Array.from({ length: mix[t] }, (_, i) => (
            <span key={`${t}${i}`} class={s.cell} style={typeColour(t)} data-testid={roundStripTestIds.cell} />
          ))
        )}
      </div>
      {total && (
        <span class={s.stripText}>
          {rounds} {rounds === 1 ? "round" : "rounds"}, in a random order
        </span>
      )}
    </div>
  )
}
