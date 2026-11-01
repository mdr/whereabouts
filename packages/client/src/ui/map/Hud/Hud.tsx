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
import styles from "./Hud.module.css"

/** `reveal` lays out a round's reveal; MapView reads `data-hud` to lift the map's buttons above its sheet. */
export const Hud = ({ reveal, children }: { reveal?: boolean; children: ComponentChildren }) => (
  <main class={cx(styles.hud, reveal && styles.reveal)} data-hud={reveal ? "reveal" : undefined}>
    {children}
  </main>
)

export const HudTop = ({ children }: { children: ComponentChildren }) => <div class={styles.top}>{children}</div>

/** `roomy`: something in it has opened up, and may take more of a phone's screen. */
export const HudRight = ({ roomy, children }: { roomy?: boolean; children: ComponentChildren }) => (
  <div class={cx(styles.right, roomy && styles.roomy)}>{children}</div>
)

export const HudCenter = ({ children }: { children: ComponentChildren }) => <div class={styles.center}>{children}</div>

/**
 * The bar along the bottom of the map. It publishes its height as
 * `--toolbar-h` on the document so the map's own corner controls (the
 * attribution button) can sit above it on phones, where the bar spans the
 * full width. `note`: a line under the buttons.
 */
export const HudBottom = ({ note, children }: { note?: string; children: ComponentChildren }) => {
  const ref = useElementRef<HTMLDivElement>()
  useEffect(() => {
    const element = ref.current
    const root = document.documentElement
    if (!element || typeof ResizeObserver === "undefined") return
    const publish = () => root.style.setProperty("--toolbar-h", `${element.offsetHeight}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(element)
    return () => {
      observer.disconnect()
      root.style.removeProperty("--toolbar-h")
    }
  }, [])
  return (
    <div class={styles.bottom} ref={ref} data-testid={hudBottomTestIds.toolbar}>
      <div class={styles.toolbar}>{children}</div>
      {note && <p class={styles.toolbarNote}>{note}</p>}
    </div>
  )
}

/** For a toolbar button that, like the primary one, takes the spare width of a phone's toolbar. */
export const toolbarGrow = styles.grow

/**
 * One-line strip at the top of the HUD: title (a link home where allowed),
 * round counter, the sound switch, and anything the screen wants on the
 * right (a countdown, a HeaderNote).
 */
export const HudHeader = ({
  home,
  round,
  total,
  right
}: {
  home?: boolean
  round: number
  total: number | string
  right?: ComponentChildren
}) => (
  <div class={styles.header} data-testid={hudHeaderTestIds.header}>
    {home ? (
      <a href="#/" class={styles.brand}>
        Whereabouts
      </a>
    ) : (
      <span class={styles.brand}>Whereabouts</span>
    )}
    <span class={styles.round} data-testid={hudHeaderTestIds.round}>
      <span class={styles.roundWord}>Round </span>
      <span class={styles.nowrap}>
        {round} / {total}
      </span>
    </span>
    <SoundToggle />
    {right}
  </div>
)

/** Small print on the right of the header: a running total (kept to one line), or who is ready. */
export const HeaderNote = ({
  nowrap,
  title,
  testId,
  children
}: {
  nowrap?: boolean
  title?: string
  testId?: string
  children: ComponentChildren
}) => (
  <span class={cx(styles.note, nowrap && styles.nowrap)} title={title}>
    <span data-testid={testId}>{children}</span>
    {title && <span class="sr-only">. {title}</span>}
  </span>
)
