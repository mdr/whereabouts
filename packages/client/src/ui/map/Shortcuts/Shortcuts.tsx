/**
 * The keyboard shortcuts, listed in a card over the map. `?` opens and closes
 * it, as does the keyboard button in the paint toolbar; Escape or a click
 * outside closes it. It lists the table in shortcuts.ts, which the keys'
 * handlers match against.
 */
import { shortcutsOpen } from "../shortcuts-open"
import { useEffect } from "preact/hooks"
import { createPortal } from "preact/compat"
import { isTyping } from "../../../keyboard/keys"
import { CLOSE, TOGGLE_LIST, listedShortcuts } from "../../../keyboard/shortcuts"
import { Card } from "../../Card/Card"
import { shortcutsTestIds } from "./ShortcutsTestIds"
import kit from "../../kit.module.css"
import styles from "./Shortcuts.module.css"

/** The card itself, plus the `?` and Escape keys. Mount once per painting screen. */
export const Shortcuts = ({ practice = false }: { practice?: boolean }) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target ?? undefined)) return
      if (TOGGLE_LIST.matches(event)) {
        shortcutsOpen.value = !shortcutsOpen.value
        event.preventDefault()
      } else if (CLOSE.matches(event) && shortcutsOpen.value) {
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
    <div class={styles.backdrop} data-testid={shortcutsTestIds.backdrop} onClick={() => (shortcutsOpen.value = false)}>
      <Card
        as="section"
        class={styles.card}
        role="dialog"
        aria-labelledby="shortcuts-title"
        onClick={(event) => event.stopPropagation()}
        data-testid={shortcutsTestIds.card}
      >
        <header>
          <h2 id="shortcuts-title" class={kit.eyebrow}>
            Keyboard shortcuts
          </h2>
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
                  <span key={i} class={styles.combo}>
                    {i > 0 && <span class={styles.sep}>{sep}</span>}
                    {combo.keys.map((key) => (
                      <kbd key={key}>{key}</kbd>
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
