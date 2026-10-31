import type { ComponentChildren, RefObject } from "preact"
import { useLayoutEffect, useState } from "preact/hooks"
import { commonsImageUrl, wikipediaUrl } from "@whereabouts/shared/questions"
import type { Fact } from "@whereabouts/shared/facts"
import type { QuestionView } from "@whereabouts/shared/protocol"
import { Icon } from "./icons"
import { flagRatio } from "../flags"
import { cx } from "./cx"
import { useElementRef } from "./element-ref"
import { CommonsCredit, flagShape, useFlagUrl } from "./Pictures"
import { Lightbox, PhotoLightbox, useEscape } from "./Lightbox"
import { factTestIds, questionCardTestIds } from "./QuestionCardTestIds"
import card from "./Card.module.css"
import q from "./QuestionCard.module.css"

const FACT_LABELS: Record<Fact["kind"], string> = {
  fame: "Why it's known",
  trivia: "Did you know?",
  flag: "About the flag"
}

/** A line of interest about the revealed answer. */
export function FactLine({ fact }: { fact: Fact | undefined }) {
  if (!fact) return undefined
  return (
    <p class={q.fact} data-testid={factTestIds.fact}>
      <span class={q.factKind}>{FACT_LABELS[fact.kind]}</span> {fact.text}
    </p>
  )
}

/** The revealed answer, with a link to read about it on Wikipedia. */
export function Answer({ label, wiki }: { label: string; wiki?: string }) {
  return (
    <p class={q.answer} data-testid={questionCardTestIds.answer}>
      It's <b>{label}</b>{" "}
      <a class={q.wikiLink} href={wikipediaUrl(wiki, label)} target="_blank" rel="noopener noreferrer">
        Wikipedia <Icon name="external" size={12} />
      </a>
    </p>
  )
}

export function QuestionCard({
  q: question,
  hud,
  children,
  credit,
  countryFlag,
  photo,
  foldable,
  startFolded
}: {
  q: QuestionView
  /** Where it sits: while painting its picture gives way on a short screen; at a reveal it heads a phone's sheet. */
  hud: "painting" | "reveal"
  children?: ComponentChildren
  /** Show the image credit link. Off while guessing: the Commons file name gives the answer away. */
  credit?: boolean
  /** A country round names the country, so its flag can show too. */
  countryFlag?: string
  /** At the reveal, the answer's photo on a round that showed none. */
  photo?: string
  /** On a phone, offer to fold the card down to its prompt for more map, if there is more. Each new question starts unfolded. */
  foldable?: boolean
  /** Fold it at first: at the reveal, the answer line shows folded, and the map matters more. */
  startFolded?: boolean
}) {
  const image = question.image ?? photo
  const ref = useElementRef<HTMLDivElement>()
  const asked = `${question.prompt} ${question.image ?? ""} ${question.flag ?? ""}`
  const [toggledQuestion, setToggledQuestion] = useState<string | undefined>(undefined)
  const flag = question.flag ?? countryFlag
  const canFold = foldable === true && Boolean(image || flag || children)
  const toggled = toggledQuestion === asked
  const folded = canFold && (startFolded === true) !== toggled
  usePictureFloor(ref, folded)
  usePublishedHeight(ref)
  return (
    <div
      class={cx(card.card, q.question, q[hud], canFold && q.foldable, folded && q.folded)}
      ref={ref}
      data-testid={questionCardTestIds.card}
    >
      {canFold && (
        <button
          type="button"
          class={cx("icon", q.foldToggle)}
          aria-expanded={!folded}
          aria-label={folded ? "Show the whole question" : "Fold the question away"}
          title={folded ? "Show the whole question" : "Fold the question away for more map"}
          onClick={() => setToggledQuestion(toggled ? undefined : asked)}
          data-testid={questionCardTestIds.foldButton}
        >
          <Icon name={folded ? "expand" : "collapse"} size={18} />
        </button>
      )}
      <p class={q.prompt} data-testid={questionCardTestIds.prompt}>
        {question.prompt}
      </p>
      {image && <QuestionImage image={image} credit={credit ?? false} />}
      {flag && <FlagImage code={flag} />}
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
function usePictureFloor(ref: RefObject<HTMLDivElement>, folded: boolean): void {
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
    const ro = new ResizeObserver(setFloor)
    ro.observe(card)
    return () => {
      ro.disconnect()
      card.style.minHeight = ""
    }
  }, [folded])
}

/**
 * Publishes the question card's height as `--question-h` on the document:
 * a phone's reveal leaves the map clear below the card (QuestionCard.module.css, map.ts).
 */
function usePublishedHeight(ref: RefObject<HTMLDivElement>): void {
  useLayoutEffect(() => {
    const card = ref.current
    const root = document.documentElement
    if (!card || typeof ResizeObserver === "undefined") return
    const publish = () => root.style.setProperty("--question-h", `${card.offsetHeight}px`)
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(card)
    return () => {
      ro.disconnect()
      root.style.removeProperty("--question-h")
    }
  }, [])
}

/** A flag round's flag; click it to enlarge. No alt text naming it: that would give the answer away. */
function FlagImage({ code }: { code: string }) {
  const src = useFlagUrl(code)
  const [large, setLarge] = useState(false)
  useEscape(large, () => setLarge(false))
  return (
    <>
      <button
        type="button"
        class={q.flag}
        data-picture
        title="Enlarge the flag"
        disabled={!src}
        onClick={() => setLarge(true)}
        style={flagShape(code)}
        data-testid={questionCardTestIds.flag}
      >
        {src && <img src={src} alt="The flag" draggable={false} />}
        <span class={q.badge} aria-hidden="true">
          <Icon name="enlarge" size={14} />
        </span>
        <span class="sr-only">Enlarge flag</span>
      </button>
      {large && src && (
        <Lightbox src={src} kind="flag" ratio={flagRatio(code)} credit={undefined} onClose={() => setLarge(false)} />
      )}
    </>
  )
}

/**
 * The question photo. Click it to enlarge over the map; click again or press
 * Escape to shrink back. The Wikimedia Commons credit sits behind a small
 * info icon linking to the file page.
 */
/** Whether a photo has shown its "Enlarge" label yet this session: after the first, just the icon. */
let enlargeLabelShown = false

function QuestionImage({ image, credit: showCredit }: { image: string; credit: boolean }) {
  const [large, setLarge] = useState(false)
  const [withLabel] = useState(() => {
    const first = !enlargeLabelShown
    enlargeLabelShown = true
    return first
  })
  useEscape(large, () => setLarge(false))
  const credit = showCredit ? <CommonsCredit image={image} /> : undefined
  const thumb = useElementRef<HTMLImageElement>()
  return (
    <>
      <div class={q.thumb} data-picture data-testid={questionCardTestIds.photo}>
        {/* The whole photo is the button; the badge says so, on phones too, where there is no hover. */}
        <button type="button" class={q.thumbButton} title="Enlarge the photo" onClick={() => setLarge(true)}>
          <img ref={thumb} src={commonsImageUrl(image)} alt="" referrerpolicy="no-referrer" />
          <span class={cx(q.badge, withLabel && q.withLabel)} aria-hidden="true">
            <Icon name="enlarge" size={14} />
            {withLabel && <span>Enlarge</span>}
          </span>
          <span class="sr-only">Enlarge photo</span>
        </button>
        {credit}
      </div>
      {large && (
        <PhotoLightbox
          image={image}
          thumb={thumb.current ?? undefined}
          credit={credit}
          onClose={() => setLarge(false)}
        />
      )}
    </>
  )
}
