import type { PlayedRound } from "@whereabouts/shared/protocol"
import { QUESTION_TYPE_LOOKS, typeColour } from "../../question-types"
import { SmallFlag } from "../../ui/pictures/Pictures"
import { cx } from "../../ui/cx"
import { RoundPicture } from "./RoundPicture"
import { roundWhatTestIds } from "./RoundWhatTestIds"
import s from "./RoundWhat.module.css"

/** An island, lake or sea round says which. */
export function typeName(round: PlayedRound): string {
  const feature = round.feature?.toLowerCase()
  return feature ? feature[0]!.toUpperCase() + feature.slice(1) : QUESTION_TYPE_LOOKS[round.type].name
}

/** The round's number, picture, what it asked about, and which type of question it was. */
export function RoundWhat({ number, round, textClass }: { number: number; round: PlayedRound; textClass?: string }) {
  return (
    <>
      <span class={s.number}>{number}</span>
      <RoundPicture round={round} />
      <span class={cx(s.text, textClass)}>
        <span class={s.label} data-testid={roundWhatTestIds.roundLabel}>
          {round.label}
          {round.area && round.flag && <SmallFlag code={round.flag} class={s.labelFlag} />}
        </span>
        <span class={s.type} style={typeColour(round.type)} data-testid={roundWhatTestIds.roundType}>
          {typeName(round)}
        </span>
      </span>
    </>
  )
}
