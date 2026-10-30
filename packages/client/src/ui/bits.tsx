import type { ComponentChildren, RefObject } from "preact"
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks"
import { useElementRef } from "./element-ref"
import {
  commonsImageUrl,
  commonsPageUrl,
  wikipediaUrl,
  type Fact,
  type QuestionView,
  type Topic
} from "@whereabouts/shared"
import { Icon } from "./icons"
import { soundOn } from "../settings"
import { flagUrl } from "../flags"
import {
  countdownTestIds,
  factTestIds,
  hudBottomTestIds,
  hudHeaderTestIds,
  questionCardTestIds,
  soundToggleTestIds
} from "./bitsTestIds"

export function fmtKm(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString()} km`
}

export function Card({ title, children, class: cls }: { title?: string; children: ComponentChildren; class?: string }) {
  return (
    <div class={`card ${cls ?? ""}`}>
      {title && <h2>{title}</h2>}
      {children}
    </div>
  )
}

/**
 * The bar along the bottom of the map. It publishes its height as
 * `--toolbar-h` on the document so the map's own corner controls (the
 * attribution button) can sit above it on phones, where the bar spans the
 * full width.
 */
export function HudBottom({ children }: { children: ComponentChildren }) {
  const ref = useElementRef<HTMLDivElement>()
  useEffect(() => {
    const el = ref.current
    const root = document.documentElement
    if (!el || typeof ResizeObserver === "undefined") return
    const publish = () => root.style.setProperty("--toolbar-h", `${el.offsetHeight}px`)
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.removeProperty("--toolbar-h")
    }
  }, [])
  return (
    <div class="hud-bottom toolbar" ref={ref} data-testid={hudBottomTestIds.toolbar}>
      {children}
    </div>
  )
}

/** The per-device sound switch as a speaker button. */
export function SoundToggle() {
  const on = soundOn.value
  return (
    <button
      type="button"
      class="icon sound-toggle"
      data-testid={soundToggleTestIds.button}
      aria-pressed={on}
      aria-label={on ? "Sounds on: turn off" : "Sounds off: turn on"}
      title={on ? "Turn sounds off" : "Turn sounds on"}
      onClick={() => (soundOn.value = !on)}
    >
      <Icon name={on ? "soundOn" : "soundOff"} />
    </button>
  )
}

/**
 * One-line strip at the top of the HUD: title (a link home where allowed),
 * round counter, the sound switch, and anything the screen wants on the
 * right (a countdown).
 */
export function HudHeader({
  home,
  round,
  total,
  right
}: {
  home?: boolean
  round: number
  total: number | string
  right?: ComponentChildren
}) {
  return (
    <div class="hud-header" data-testid={hudHeaderTestIds.header}>
      {home ? (
        <a href="#/" class="brand">
          Whereabouts
        </a>
      ) : (
        <span class="brand">Whereabouts</span>
      )}
      <span class="round" data-testid={hudHeaderTestIds.round}>
        <span class="round-word">Round </span>
        <span class="nowrap">
          {round} / {total}
        </span>
      </span>
      <SoundToggle />
      {right}
    </div>
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
    <p class="fact" data-testid={factTestIds.fact}>
      <span class="fact-kind">{FACT_LABELS[fact.kind]}</span> {fact.text}
    </p>
  )
}

/** The revealed answer, with a link to read about it on Wikipedia. */
export function Answer({ label, wiki }: { label: string; wiki?: string }) {
  return (
    <p class="answer" data-testid={questionCardTestIds.answer}>
      It's <b>{label}</b>{" "}
      <a class="wiki-link" href={wikipediaUrl(wiki, label)} target="_blank" rel="noopener noreferrer">
        Wikipedia <Icon name="external" size={12} />
      </a>
    </p>
  )
}

export function QuestionCard({
  q,
  children,
  credit,
  countryFlag,
  photo,
  foldable,
  startFolded
}: {
  q: QuestionView
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
  const image = q.image ?? photo
  const ref = useElementRef<HTMLDivElement>()
  const question = `${q.prompt} ${q.image ?? ""} ${q.flag ?? ""}`
  const [toggledQuestion, setToggledQuestion] = useState<string | undefined>(undefined)
  const flag = q.flag ?? countryFlag
  const canFold = foldable === true && Boolean(image || flag || children)
  const toggled = toggledQuestion === question
  const folded = canFold && (startFolded === true) !== toggled
  usePictureFloor(ref, folded)
  usePublishedHeight(ref)
  return (
    <div
      class={`card question ${canFold ? "foldable" : ""} ${folded ? "folded" : ""}`}
      ref={ref}
      data-testid={questionCardTestIds.card}
    >
      {canFold && (
        <button
          type="button"
          class="icon fold-toggle"
          aria-expanded={!folded}
          aria-label={folded ? "Show the whole question" : "Fold the question away"}
          title={folded ? "Show the whole question" : "Fold the question away for more map"}
          onClick={() => setToggledQuestion(toggled ? undefined : question)}
          data-testid={questionCardTestIds.foldButton}
        >
          <Icon name={folded ? "expand" : "collapse"} size={18} />
        </button>
      )}
      <p class="prompt" data-testid={questionCardTestIds.prompt}>
        {q.prompt}
      </p>
      {image && <QuestionImage image={image} credit={credit ?? false} />}
      {flag && <FlagImage code={flag} />}
      {children}
    </div>
  )
}

/**
 * On a short screen the question's photo or flag shrinks to keep the cards
 * below it in view (style.css). CSS alone cannot stop the card shrinking past
 * its text, so this sets the card's least height: everything else, plus the
 * picture at its own min-height. Below that the column of cards scrolls.
 */
function usePictureFloor(ref: RefObject<HTMLDivElement>, folded: boolean): void {
  // Before paint, so folding never shows a frame held at the unfolded floor.
  useLayoutEffect(() => {
    const card = ref.current
    if (!card || typeof ResizeObserver === "undefined") return
    const setFloor = () => {
      const picture = card.querySelector<HTMLElement>(".thumb, .flag")
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
 * a phone's reveal leaves the map clear below the card (style.css, map.ts).
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
      <button type="button" class="flag" title="Enlarge the flag" disabled={!src} onClick={() => setLarge(true)}>
        {src && <img src={src} alt="The flag" draggable={false} />}
        <span class="enlarge-badge" aria-hidden="true">
          <Icon name="enlarge" size={14} />
        </span>
        <span class="sr-only">Enlarge flag</span>
      </button>
      {large && src && <Lightbox src={src} kind="flag" credit={undefined} onClose={() => setLarge(false)} />}
    </>
  )
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
export function SmallFlag({ code }: { code: string }) {
  const src = useFlagUrl(code)
  return <span class="small-flag">{src && <img src={src} alt="" draggable={false} />}</span>
}

/** Under a "Paint the whole of …" question: what to cover. */
export function RegionHint({ topic }: { topic?: Topic }) {
  return <p class="hint region-hint">Cover the whole {topic ?? "country"}: its shape counts.</p>
}

/** AnswerMode and RegionHint in a line, for the headset; undefined for a place. */
export function answerModeText(q: { flag?: unknown; regionId?: unknown; topic?: Topic }): string | undefined {
  const area = q.regionId !== undefined
  if (q.flag) return area ? "Paint the whole country: its shape counts." : "Paint where it is: a place, not a shape."
  return area ? `Cover the whole ${q.topic ?? "country"}: its shape counts.` : undefined
}

/**
 * How to answer a flag round, big and plain, since the two are painted so
 * differently: cover the whole country, or mark where a small one is.
 */
export function AnswerMode({ area }: { area: boolean }) {
  return area ? (
    <div class="answer-mode area">
      <Icon name="brush" size={18} />
      <div>
        <b>Paint the whole country</b>
        <span>Its shape counts: cover all of it, and nothing else.</span>
      </div>
    </div>
  ) : (
    <div class="answer-mode point">
      <Icon name="pin" size={18} />
      <div>
        <b>Paint where it is</b>
        <span>A place, not a shape: the tighter your paint, the surer you are.</span>
      </div>
    </div>
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
  const credit = !showCredit ? undefined : (
    <a
      class="credit-icon"
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
  return (
    <>
      <div class="thumb" data-testid={questionCardTestIds.photo}>
        {/* The whole photo is the button; the badge says so, on phones too, where there is no hover. */}
        <button type="button" class="thumb-button" title="Enlarge the photo" onClick={() => setLarge(true)}>
          <img src={commonsImageUrl(image)} alt="" referrerpolicy="no-referrer" />
          <span class={`enlarge-badge ${withLabel ? "with-label" : ""}`} aria-hidden="true">
            <Icon name="enlarge" size={14} />
            {withLabel && <span>Enlarge</span>}
          </span>
          <span class="sr-only">Enlarge photo</span>
        </button>
        {credit}
      </div>
      {large && (
        <Lightbox src={commonsImageUrl(image, 1600)} kind="photo" credit={credit} onClose={() => setLarge(false)} />
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
  credit,
  onClose
}: {
  src: string
  kind: "photo" | "flag"
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

  return (
    <div
      class="lightbox"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      title="Scroll or pinch to zoom, drag to pan; click the backdrop or press Escape to close"
    >
      <button class="lightbox-close" aria-label="Close" onClick={onClose}>
        ×
      </button>
      <div
        class={`lightbox-frame ${zoom > 1 ? "zoomed" : ""}`}
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
          class={`lightbox-${kind}`}
          alt=""
          referrerpolicy="no-referrer"
          draggable={false}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        />
        {credit}
      </div>
    </div>
  )
}

/** Ticks once a second; returns whole seconds remaining, never negative. */
function useCountdown(msRemaining: () => number): number {
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [])
  return Math.max(0, Math.ceil(msRemaining() / 1000))
}

export function Countdown({ msRemaining, warnAt = 10 }: { msRemaining: () => number; warnAt?: number }) {
  const s = useCountdown(msRemaining)
  return (
    <div class={`countdown ${s <= warnAt ? "warn" : ""}`} data-testid={countdownTestIds.countdown}>
      {s}
    </div>
  )
}

/** Score, A and B in the dev drawer. */
export function ScoreParts({ A, B }: { A: number; B: number }) {
  return (
    <div class="parts">
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
