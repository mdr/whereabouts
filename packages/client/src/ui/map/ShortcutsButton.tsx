import { Icon } from "../icons"
import { shortcutsOpen } from "./shortcuts-open"
import { shortcutsButtonTestIds } from "./ShortcutsButtonTestIds"
import s from "./ShortcutsButton.module.css"

/** Toolbar button that opens the card; hidden where there is no keyboard (see CSS). */
export function ShortcutsButton() {
  return (
    <button
      class={s.button}
      data-testid={shortcutsButtonTestIds.button}
      title="Keyboard shortcuts (?)"
      aria-label="Keyboard shortcuts"
      aria-expanded={shortcutsOpen.value}
      onClick={() => (shortcutsOpen.value = !shortcutsOpen.value)}
    >
      <Icon name="keyboard" />
    </button>
  )
}
