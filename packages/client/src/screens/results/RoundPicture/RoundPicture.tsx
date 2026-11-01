import type { PlayedRound } from "@whereabouts/shared/protocol/views"
import type { QuestionType } from "@whereabouts/shared/questions"
import { useMemo } from "preact/hooks"
import { useOutline } from "../../../data/outlines"
import { typeColour } from "../../../question-types"
import { Icon } from "../../../ui/icons"
import { outlinePath } from "../../../ui/outline-path"
import { SmallFlagButton } from "../../../ui/pictures/SmallFlagButton/SmallFlagButton"
import { SmallPhoto } from "../../../ui/pictures/SmallPhoto/SmallPhoto"
import { SmallPictureBox } from "../../../ui/pictures/SmallPictureBox"
import styles from "./RoundPicture.module.css"

/** A shape round shows the shape painted; the rest, the question's photo or flag, else the reveal's photo. */
export function RoundPicture({ round }: { round: PlayedRound }) {
  if (round.area) return <RoundShape area={round.area} type={round.type} />
  if (round.image) return <SmallPhoto image={round.image} />
  if (round.flag) return <SmallFlagButton code={round.flag} />
  if (round.revealPhoto) return <SmallPhoto image={round.revealPhoto} />
  return (
    <SmallPictureBox>
      <Icon name="pin" size={18} />
    </SmallPictureBox>
  )
}

function RoundShape({ area, type }: { area: NonNullable<PlayedRound["area"]>; type: QuestionType }) {
  const outline = useOutline(area.outline)
  const path = useMemo(() => (outline ? outlinePath(outline, area.centre, 56, 42) : ""), [outline])
  return (
    <SmallPictureBox class={styles.shape} style={typeColour(type)}>
      {path && (
        <svg viewBox="0 0 56 42" aria-hidden="true">
          <path d={path} />
        </svg>
      )}
    </SmallPictureBox>
  )
}
