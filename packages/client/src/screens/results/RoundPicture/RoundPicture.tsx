import { PictureType, type PlayedRound, type ShapePicture } from "@whereabouts/shared/protocol/views"
import type { QuestionType } from "@whereabouts/shared/questions"
import { useMemo } from "preact/hooks"
import { useOutline } from "../../../data/outlines"
import { questionTypeColourStyle } from "../../../question-types"
import { Icon } from "../../../ui/icons"
import { outlinePath } from "../../../ui/outline-path"
import { SmallFlagButton } from "../../../ui/pictures/SmallFlagButton/SmallFlagButton"
import { SmallPhoto } from "../../../ui/pictures/SmallPhoto/SmallPhoto"
import { SmallPictureBox } from "../../../ui/pictures/SmallPictureBox"
import styles from "./RoundPicture.module.css"

/** A shape round shows the shape painted; the rest, the question's photo or flag, else the reveal's photo. */
export const RoundPicture = ({ round }: { round: PlayedRound }) => {
  const { picture } = round
  switch (picture.type) {
    case PictureType.SHAPE:
      return <RoundShape shape={picture} type={round.type} />
    case PictureType.PHOTO:
      return <SmallPhoto image={picture.photo} />
    case PictureType.FLAG:
      return <SmallFlagButton code={picture.flag} />
    case PictureType.NONE:
      return (
        <SmallPictureBox>
          <Icon name="pin" size={18} />
        </SmallPictureBox>
      )
  }
}

const RoundShape = ({ shape, type }: { shape: ShapePicture; type: QuestionType }) => {
  const outline = useOutline(shape.outline)
  const path = useMemo(() => (outline ? outlinePath(outline, shape.centre, 56, 42) : ""), [outline])
  return (
    <SmallPictureBox class={styles.shape} style={questionTypeColourStyle(type)}>
      {path && (
        <svg viewBox="0 0 56 42" aria-hidden="true">
          <path d={path} />
        </svg>
      )}
    </SmallPictureBox>
  )
}
