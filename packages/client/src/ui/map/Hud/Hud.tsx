/**
 * The overlay on the map: a column of cards at the top left, another at the
 * top right, the toolbar along the bottom, or one card in the middle. On a
 * phone it becomes a single column; at a reveal, the cards below the
 * question make one sheet that scrolls up over the map.
 */
import type { ComponentChildren } from "preact"
import { useEffect } from "preact/hooks"
import { useElementRef } from "../../element-ref"
import { cx } from "../../cx"
import { hudBottomTestIds, hudHeaderTestIds } from "./HudTestIds"
import { SoundToggle } from "../SoundToggle/SoundToggle"
import s from "./Hud.module.css"

/** `reveal` lays out a round's reveal; MapView reads `data-hud` to lift the map's buttons above its sheet. */
export function Hud({ reveal, children }: { reveal?: boolean; children: ComponentChildren }) {
  return (
    <main class={cx(s.hud, reveal && s.reveal)} data-hud={reveal ? "reveal" : undefined}>
      {children}
    </main>
  )
}

export function HudTop({ children }: { children: ComponentChildren }) {
  return <div class={s.top}>{children}</div>
}

/** `roomy`: something in it has opened up, and may take more of a phone's screen. */
export function HudRight({ roomy, children }: { roomy?: boolean; children: ComponentChildren }) {
  return <div class={cx(s.right, roomy && s.roomy)}>{children}</div>
}

export function HudCenter({ children }: { children: ComponentChildren }) {
  return <div class={s.center}>{children}</div>
}

/**
 * The bar along the bottom of the map. It publishes its height as
 * `--toolbar-h` on the document so the map's own corner controls (the
 * attribution button) can sit above it on phones, where the bar spans the
 * full width. `note`: a line under the buttons.
 */
export function HudBottom({ note, children }: { note?: string; children: ComponentChildren }) {
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
    <div class={s.bottom} ref={ref} data-testid={hudBottomTestIds.toolbar}>
      <div class={s.toolbar}>{children}</div>
      {note && <p class={s.toolbarNote}>{note}</p>}
    </div>
  )
}

/** For a toolbar button that, like the primary one, takes the spare width of a phone's toolbar. */
export const toolbarGrow = s.grow

/**
 * One-line strip at the top of the HUD: title (a link home where allowed),
 * round counter, the sound switch, and anything the screen wants on the
 * right (a countdown, a HeaderNote).
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
    <div class={s.header} data-testid={hudHeaderTestIds.header}>
      {home ? (
        <a href="#/" class={s.brand}>
          Whereabouts
        </a>
      ) : (
        <span class={s.brand}>Whereabouts</span>
      )}
      <span class={s.round} data-testid={hudHeaderTestIds.round}>
        <span class={s.roundWord}>Round </span>
        <span class={s.nowrap}>
          {round} / {total}
        </span>
      </span>
      <SoundToggle />
      {right}
    </div>
  )
}

/** Small print on the right of the header: a running total (kept to one line), or who is ready. */
export function HeaderNote({
  nowrap,
  title,
  testId,
  children
}: {
  nowrap?: boolean
  title?: string
  testId?: string
  children: ComponentChildren
}) {
  return (
    <span class={cx(s.note, nowrap && s.nowrap)} title={title}>
      <span data-testid={testId}>{children}</span>
      {title && <span class="sr-only">. {title}</span>}
    </span>
  )
}
