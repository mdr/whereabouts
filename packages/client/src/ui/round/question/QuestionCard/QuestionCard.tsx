import type { ComponentChildren, RefObject } from "preact"
import { useLayoutEffect, useState } from "preact/hooks"
import { clueFlag, clueImage, promptOf } from "@whereabouts/shared/questions"
import type { CommonsFile } from "@whereabouts/shared/ids"
import { flagShown, type QuestionView } from "@whereabouts/shared/protocol/views"
import { Icon } from "../../../icons"
import { cx } from "../../../cx"
import { useElementRef } from "../../../element-ref"
import { FlagImage } from "../FlagImage/FlagImage"
import { QuestionImage } from "../QuestionImage/QuestionImage"
import { questionCardTestIds } from "./QuestionCardTestIds"
import card from "../../../Card/Card.module.css"
import styles from "./QuestionCard.module.css"
import { questionCardHeight } from "./question-card-height"

/** Where a question card sits. */
export enum CardPlace {
  /** While painting, its picture gives way on a short screen. */
  PAINTING = "PAINTING",
  /** At a reveal, it heads a phone's sheet. */
  REVEAL = "REVEAL"
}

const PLACE_CLASS: Record<CardPlace, string | undefined> = {
  [CardPlace.PAINTING]: styles.painting,
  [CardPlace.REVEAL]: styles.reveal
}

export const QuestionCard = ({
  question,
  hud,
  children,
  credit,
  photo,
  foldable,
  startFolded
}: {
  question: QuestionView
  hud: CardPlace
  children?: ComponentChildren
  /** Show the image credit link. Off while guessing: the Commons file name gives the answer away. */
  credit?: boolean
  /** At the reveal, the answer's photo on a round that showed none. */
  photo?: CommonsFile
  /** On a phone, offer to fold the card down to its prompt for more map, if there is more. Each new question starts unfolded. */
  foldable?: boolean
  /** Fold it at first: at the reveal, the answer line shows folded, and the map matters more. */
  startFolded?: boolean
}) => {
  const image = clueImage(question.clue) ?? photo
  const ref = useElementRef<HTMLDivElement>()
  const prompt = promptOf(question)
  const asked = `${prompt}${clueImage(question.clue) ?? ""} ${clueFlag(question.clue) ?? ""}`
  const [toggledQuestion, setToggledQuestion] = useState<string | undefined>(undefined)
  // A country round names the country, so its flag can show too.
  const flag = flagShown(question)
  const canFold = foldable === true && Boolean(image || flag || children)
  const toggled = toggledQuestion === asked
  const folded = canFold && (startFolded === true) !== toggled
  usePictureFloor(ref, folded)
  usePublishedHeight(ref)
  return (
    <div
      class={cx(card.card, styles.question, PLACE_CLASS[hud], canFold && styles.foldable, folded && styles.folded)}
      ref={ref}
      data-testid={questionCardTestIds.card}
    >
      {canFold && (
        <button
          type="button"
          class={cx("icon", styles.foldToggle)}
          aria-expanded={!folded}
          aria-label={folded ? "Show the whole question" : "Fold the question away"}
          title={folded ? "Show the whole question" : "Fold the question away for more map"}
          onClick={() => setToggledQuestion(toggled ? undefined : asked)}
          data-testid={questionCardTestIds.foldButton}
        >
          <Icon name={folded ? "expand" : "collapse"} size={18} />
        </button>
      )}
      <h2 class={styles.prompt} data-testid={questionCardTestIds.prompt}>
        {prompt}
      </h2>
      {image && <QuestionImage image={image} credit={credit ?? false} painting={hud === CardPlace.PAINTING} />}
      {flag && <FlagImage code={flag} painting={hud === CardPlace.PAINTING} />}
      {children}
    </div>
  )
}

/**
 * On a short screen the question's photo or flag shrinks to keep the cards
 * below it in view (QuestionCard.module.css). CSS alone cannot stop the card shrinking past
 * its text, so this sets the card's least height: everything else, plus the
 * picture at its own min-height. Below that the column of cards scrolls.
 */
const usePictureFloor = (ref: RefObject<HTMLDivElement>, folded: boolean): void => {
  // Before paint, so folding never shows a frame held at the unfolded floor.
  useLayoutEffect(() => {
    const card = ref.current
    if (!card || typeof ResizeObserver === "undefined") return
    const setFloor = () => {
      const picture = card.querySelector<HTMLElement>("[data-picture]")
      const least = picture ? parseFloat(getComputedStyle(picture).minHeight) : NaN
      const shown = picture ? picture.getClientRects().length > 0 : false
      // scrollHeight counts the padding, which a content-box min-height leaves out.
      const style = getComputedStyle(card)
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
      card.style.minHeight =
        picture && shown && least > 0 ? `${card.scrollHeight - padding - picture.offsetHeight + least}px` : ""
    }
    setFloor()
    const observer = new ResizeObserver(setFloor)
    observer.observe(card)
    return () => {
      observer.disconnect()
      card.style.minHeight = ""
    }
  }, [folded])
}

/**
 * Publishes the question card's height as `--question-h` on the document:
 * a phone's reveal leaves the map clear below the card (QuestionCard.module.css, map-camera.ts).
 */
const usePublishedHeight = (ref: RefObject<HTMLDivElement>): void => {
  useLayoutEffect(() => {
    const card = ref.current
    const root = document.documentElement
    if (!card || typeof ResizeObserver === "undefined") return
    const publish = () => {
      root.style.setProperty("--question-h", `${card.offsetHeight}px`)
      questionCardHeight.value = card.offsetHeight
    }
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(card)
    return () => {
      observer.disconnect()
      root.style.removeProperty("--question-h")
      questionCardHeight.value = 0
    }
  }, [])
}
