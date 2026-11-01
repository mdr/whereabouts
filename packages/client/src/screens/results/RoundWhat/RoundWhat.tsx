import type { PlayedRound } from "@whereabouts/shared/protocol/views"
import { QuestionType } from "@whereabouts/shared/questions"
import { QUESTION_TYPE_LOOKS, questionTypeColourStyle } from "../../../question-types"
import { SmallFlag } from "../../../ui/pictures/SmallFlag/SmallFlag"
import { cx } from "../../../ui/cx"
import { RoundPicture } from "../RoundPicture/RoundPicture"
import { roundWhatTestIds } from "./RoundWhatTestIds"
import styles from "./RoundWhat.module.css"

/** An island, lake or sea round says which. */
export const typeName = (round: PlayedRound): string => {
  if (round.type !== QuestionType.FEATURE) return QUESTION_TYPE_LOOKS[round.type].name
  const feature = round.feature.toLowerCase()
  return feature[0]!.toUpperCase() + feature.slice(1)
}

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
