import type { PlayedRound } from "@whereabouts/shared/protocol/views"
import { QuestionType } from "@whereabouts/shared/questions"
import { questionTypeColourStyle } from "../../../question-types"
import { SmallFlag } from "../../../ui/pictures/SmallFlag/SmallFlag"
import { cx } from "../../../ui/cx"
import { RoundPicture } from "../RoundPicture/RoundPicture"
import { typeName } from "../results-table"
import { roundWhatTestIds } from "./RoundWhatTestIds"
import styles from "./RoundWhat.module.css"

/** The round's number, picture, what it asked about, and which type of question it was. */
export const RoundWhat = ({ number, round, textClass }: { number: number; round: PlayedRound; textClass?: string }) => (
  <>
    <span class={styles.number}>{number}</span>
    <RoundPicture round={round} />
    <span class={cx(styles.text, textClass)}>
      <span class={styles.label} data-testid={roundWhatTestIds.roundLabel}>
        {round.label}
        {round.type === QuestionType.COUNTRY && round.countryFlag && (
          <SmallFlag code={round.countryFlag} class={styles.labelFlag} />
        )}
      </span>
      <span class={styles.type} style={questionTypeColourStyle(round.type)} data-testid={roundWhatTestIds.roundType}>
        {typeName(round)}
      </span>
    </span>
  </>
)
