/**
 * The keyboard shortcuts, listed in a card over the map. `?` opens and closes
 * it, as does the keyboard button in the paint toolbar; Escape or a click
 * outside closes it. It lists the table in shortcuts.ts, which the keys'
 * handlers match against.
 */
import { signal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import { createPortal } from "preact/compat"
import { Icon } from "./icons"
import { isTyping } from "../keys"
import { CLOSE, TOGGLE_LIST, listedShortcuts } from "../shortcuts"
import { Card } from "./Card"
import { shortcutsTestIds } from "./ShortcutsTestIds"
import s from "./Shortcuts.module.css"

export const shortcutsOpen = signal(false)

/** Toolbar button that opens the card; hidden where there is no keyboard (see CSS). */
export function ShortcutsButton() {
  return (
    <button
      class={s.button}
      data-testid={shortcutsTestIds.button}
      title="Keyboard shortcuts (?)"
      aria-label="Keyboard shortcuts"
      aria-expanded={shortcutsOpen.value}
      onClick={() => (shortcutsOpen.value = !shortcutsOpen.value)}
    >
      <Icon name="keyboard" />
    </button>
  )
}

/** The card itself, plus the `?` and Escape keys. Mount once per painting screen. */
export function Shortcuts({ practice = false }: { practice?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target ?? undefined)) return
      if (TOGGLE_LIST.matches(e)) {
        shortcutsOpen.value = !shortcutsOpen.value
        e.preventDefault()
      } else if (CLOSE.matches(e) && shortcutsOpen.value) {
        shortcutsOpen.value = false
      }
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      shortcutsOpen.value = false
    }
  }, [])
  if (!shortcutsOpen.value) return undefined
  // Into <body>, like the confirm dialog: the toolbar's transform would
  // otherwise trap a fixed card.
  return createPortal(
    <div class={s.backdrop} data-testid={shortcutsTestIds.backdrop} onClick={() => (shortcutsOpen.value = false)}>
      <Card
        as="section"
        class={s.card}
        role="dialog"
        aria-labelledby="shortcuts-title"
        onClick={(e) => e.stopPropagation()}
        data-testid={shortcutsTestIds.card}
      >
        <header>
          <h2 id="shortcuts-title">Keyboard shortcuts</h2>
          <button class="icon" aria-label="Close" title="Close (Esc)" onClick={() => (shortcutsOpen.value = false)}>
            ×
          </button>
        </header>
        <dl>
          {listedShortcuts(practice).map(({ action, combos, sep }) => (
            <div key={action}>
              <dt>{action}</dt>
              <dd>
                {combos.map((combo, i) => (
                  <span key={i} class={s.combo}>
                    {i > 0 && <span class={s.sep}>{sep}</span>}
                    {combo.keys.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>,
    document.body
  )
}
