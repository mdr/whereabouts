import type { ComponentChildren, HTMLAttributes, RefObject } from "preact"
import { createPortal } from "preact/compat"
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks"
import { useElementRef } from "./element-ref"
import { commonsImageUrl, commonsPageUrl, wikipediaUrl } from "@whereabouts/shared/questions"
import type { Fact } from "@whereabouts/shared/facts"
import type { QuestionView } from "@whereabouts/shared/protocol"
import { Icon } from "./icons"
import { flagFile, flagRatio, flagUrl } from "../flags"
import { cx } from "./cx"
import { factTestIds, questionCardTestIds } from "./bitsTestIds"
import s from "./bits.module.css"
import q from "./QuestionCard.module.css"
import lb from "./Lightbox.module.css"
import kit from "./kit.module.css"

export function fmtKm(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString()} km`
}

/** `as` a paragraph or a section where the card is one; anything else passes on to that element. */
export function Card({
  title,
  children,
  class: cls,
  as: Tag = "div",
  ...rest
}: {
  title?: string
  children: ComponentChildren
  class?: string
  as?: "div" | "p" | "section"
} & Omit<HTMLAttributes<HTMLDivElement>, "title" | "class" | "as">) {
  // Typed as a div, the attributes the three share.
  const El = Tag as "div"
  return (
    <El class={cx(s.card, cls)} {...rest}>
      {title && <h2 class={s.title}>{title}</h2>}
      {children}
    </El>
  )
}

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
      class={cx(s.card, q.question, q[hud], canFold && q.foldable, folded && q.folded)}
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

/** The picture of a flag, once its chunk has loaded. */
function useFlagUrl(code: string): string | undefined {
  const [src, setSrc] = useState<string | undefined>(undefined)
  useEffect(() => {
    let live = true
    setSrc(undefined)
    void flagUrl(code).then((url) => live && setSrc(url))
    return () => {
      live = false
    }
  }, [code])
  return src
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

/** The flag's shape, for its frame to take before the picture loads. */
function flagShape(code: string): Record<string, string> {
  return { "--flag-ratio": String(flagRatio(code)) }
}

/** Calls `close` on Escape while `open`. */
function useEscape(open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])
}

/** A small flag beside a country's name, which says the name: no alt text of its own. */
export function SmallFlag({ code, class: cls }: { code: string; class?: string }) {
  const src = useFlagUrl(code)
  return (
    <span class={cx(s.smallFlag, cls)} style={flagShape(code)}>
      {src && <img src={src} alt="" draggable={false} />}
    </span>
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

function CommonsCredit({ image }: { image: string }) {
  return (
    <a
      class={q.credit}
      href={commonsPageUrl(image)}
      target="_blank"
      rel="noopener"
      title="Image from Wikimedia Commons"
      aria-label="Image credit: Wikimedia Commons"
      onClick={(e) => e.stopPropagation()}
    >
      <Icon name="info" size={14} />
    </a>
  )
}

/** A photo the size of a list row; click it to enlarge. */
export function SmallPictureBox({
  class: cls,
  style,
  children
}: {
  class?: string
  style?: Record<string, string>
  children?: ComponentChildren
}) {
  return (
    <span class={cx(s.smallPicture, cls)} style={style}>
      {children}
    </span>
  )
}

export function SmallPhoto({ image }: { image: string }) {
  const [large, setLarge] = useState(false)
  useEscape(large, () => setLarge(false))
  const thumb = useElementRef<HTMLImageElement>()
  return (
    <>
      <button type="button" class={s.smallPicture} title="Enlarge the photo" onClick={() => setLarge(true)}>
        {/* The rounds' rendition, which the page already has. */}
        <img ref={thumb} src={commonsImageUrl(image)} alt="" referrerpolicy="no-referrer" />
        <span class="sr-only">Enlarge photo</span>
      </button>
      {large && (
        <PhotoLightbox
          image={image}
          thumb={thumb.current ?? undefined}
          credit={<CommonsCredit image={image} />}
          onClose={() => setLarge(false)}
        />
      )}
    </>
  )
}

/**
 * A photo enlarged: at once the thumbnail's rendition, which the page has,
 * at the size the larger one will show, then that larger one once loaded.
 */
function PhotoLightbox({
  image,
  thumb,
  credit,
  onClose
}: {
  image: string
  thumb: HTMLImageElement | undefined
  credit: ComponentChildren
  onClose: () => void
}) {
  const [src, setSrc] = useState(commonsImageUrl(image))
  useEffect(() => {
    const large = new Image()
    large.referrerPolicy = "no-referrer"
    large.src = commonsImageUrl(image, 1600)
    let open = true
    // Decoded first, so the swap never shows it half drawn.
    large.decode().then(
      () => open && setSrc(large.src),
      () => undefined
    )
    return () => {
      open = false
    }
  }, [image])
  const ratio = thumb?.naturalWidth ? thumb.naturalWidth / thumb.naturalHeight : undefined
  return <Lightbox src={src} kind="photo" ratio={ratio} credit={credit} onClose={onClose} />
}

/**
 * A flag the size of a list row; click it to enlarge. Shown once the round
 * is over, so its Commons credit (which names the country) can show too.
 */
export function SmallFlagButton({ code }: { code: string }) {
  const src = useFlagUrl(code)
  const file = flagFile(code)
  const [large, setLarge] = useState(false)
  useEscape(large, () => setLarge(false))
  return (
    <>
      <button
        type="button"
        class={cx(s.smallPicture, s.flagPicture)}
        title="Enlarge the flag"
        disabled={!src}
        onClick={() => setLarge(true)}
      >
        <span class={s.flagShape} style={flagShape(code)}>
          {src && <img src={src} alt="" draggable={false} />}
        </span>
        <span class="sr-only">Enlarge flag</span>
      </button>
      {large && src && (
        <Lightbox
          src={src}
          kind="flag"
          ratio={flagRatio(code)}
          credit={file && <CommonsCredit image={file} />}
          onClose={() => setLarge(false)}
        />
      )}
    </>
  )
}

const MAX_ZOOM = 6
const CLICK_ZOOM = 2.5

/**
 * The enlarged photo or flag. Scroll or pinch to zoom about the pointer, drag to pan
 * once zoomed, click the picture to jump between fit and a closer look, and
 * click the backdrop, the close button or press Escape to leave. A photo is
 * a larger rendition than the thumbnail's, so zooming has detail to show.
 */
function Lightbox({
  src,
  kind,
  ratio,
  credit,
  onClose
}: {
  src: string
  kind: "photo" | "flag"
  /** Width over height, to show it as large as fits: a flag's SVG has no size of its own, and a photo may start small. */
  ratio?: number
  credit: ComponentChildren
  onClose: () => void
}) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const frame = useElementRef<HTMLDivElement>()
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchDist = useRef<number | undefined>(undefined)
  const dragged = useRef(false)

  /** Zoom by `factor` keeping the point (cx, cy), relative to the frame centre, fixed. */
  function zoomAt(factor: number, cx: number, cy: number) {
    const next = Math.min(MAX_ZOOM, Math.max(1, zoom * factor))
    if (next === zoom) return
    const k = next / zoom
    setPan(next === 1 ? { x: 0, y: 0 } : { x: pan.x * k + cx * (1 - k), y: pan.y * k + cy * (1 - k) })
    setZoom(next)
  }
  /** Client coordinates to an offset from the frame centre. */
  function fromCentre(clientX: number, clientY: number) {
    const r = frame.current?.getBoundingClientRect()
    if (!r) return { cx: 0, cy: 0 }
    return { cx: clientX - (r.left + r.width / 2), cy: clientY - (r.top + r.height / 2) }
  }

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const { cx, cy } = fromCentre(e.clientX, e.clientY)
    zoomAt(Math.exp(-e.deltaY * 0.002), cx, cy)
  }
  const onPointerDown = (e: PointerEvent) => {
    // Captured, the click that follows goes to the frame, so onClick lives there; the credit link keeps its own.
    if (!(e.target as Element).closest("a")) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    dragged.current = false
    if (pointers.current.size === 2) pinchDist.current = pinchDistance()
  }
  const onPointerMove = (e: PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2 && pinchDist.current) {
      const dist = pinchDistance()
      const [a, b] = [...pointers.current.values()]
      const { cx, cy } = fromCentre((a!.x + b!.x) / 2, (a!.y + b!.y) / 2)
      zoomAt(dist / pinchDist.current, cx, cy)
      pinchDist.current = dist
      dragged.current = true
    } else if (pointers.current.size === 1 && zoom > 1) {
      const dx = e.clientX - prev.x
      const dy = e.clientY - prev.y
      if (Math.abs(dx) + Math.abs(dy) > 2) dragged.current = true
      setPan({ x: pan.x + dx, y: pan.y + dy })
    }
  }
  const onPointerUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchDist.current = undefined
  }
  function pinchDistance() {
    const [a, b] = [...pointers.current.values()]
    return Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1
  }
  const onFrameClick = (e: MouseEvent) => {
    e.stopPropagation()
    if ((e.target as Element).closest("a")) return
    if (dragged.current) return // the end of a drag or pinch, not a click
    if (zoom > 1) zoomAt(1 / zoom, 0, 0)
    else {
      const { cx, cy } = fromCentre(e.clientX, e.clientY)
      zoomAt(CLICK_ZOOM, cx, cy)
    }
  }

  // Into <body>: a sticky table cell, say, would otherwise hold it under the cells below.
  return createPortal(
    <div
      class={lb.lightbox}
      role="dialog"
      aria-modal="true"
      aria-label="Picture"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      title="Scroll or pinch to zoom, drag to pan; click the backdrop or press Escape to close"
    >
      <button class={lb.close} aria-label="Close" onClick={onClose}>
        ×
      </button>
      <div
        class={cx(lb.frame, zoom > 1 && lb.zoomed)}
        ref={frame}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onFrameClick}
      >
        <img
          src={src}
          class={cx(lb[kind], ratio !== undefined && lb.fit)}
          alt=""
          referrerpolicy="no-referrer"
          draggable={false}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            ...(ratio && { "--ratio": String(ratio) })
          }}
        />
        {credit}
      </div>
    </div>,
    document.body
  )
}

/** Score, A and B in the dev drawer. */
export function ScoreParts({ A, B }: { A: number; B: number }) {
  return (
    <div class={kit.parts}>
      <span>
        A <b>{A.toFixed(3)}</b>
      </span>
      <span>
        B <b>{B.toFixed(3)}</b>
      </span>
      <span>
        2A−B <b>{(2 * A - B).toFixed(3)}</b>
      </span>
    </div>
  )
}
