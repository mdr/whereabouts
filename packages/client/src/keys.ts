/**
 * Whether a key press is someone typing, which shortcuts should leave alone:
 * text fields, text areas, selects and editable content. A focused slider,
 * checkbox or button is not typing (the brush slider keeps focus after a
 * drag, and [ and ] should still resize the brush).
 */
const NOT_TEXT = new Set(["range", "checkbox", "radio", "button", "submit", "reset", "color", "file", "image"])

export function isTyping(target: EventTarget | undefined): boolean {
  if (target instanceof HTMLInputElement) return !NOT_TEXT.has(target.type)
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  return target instanceof HTMLElement && target.isContentEditable
}

let tabbedTo: Element | undefined = undefined

/** Start noting which control the player reached with the keyboard. Call once at start-up. */
export function trackKeyboardFocus(): void {
  // Read as focus arrives: any key press, a shortcut's own included, turns a
  // clicked button's focus ring on too.
  window.addEventListener("focusin", (e) => {
    const target = e.target
    tabbedTo =
      target instanceof HTMLElement && !target.closest(".maplibregl-map") && target.matches(":focus-visible")
        ? target
        : undefined
  })
  window.addEventListener("pointerdown", () => (tabbedTo = undefined), true)
}

/**
 * Whether a key press belongs to a control the player Tabbed to, so a
 * page-wide shortcut should leave it to that control. One focused by a
 * click shows no focus ring, and the map is no control: there the key is
 * the shortcut's.
 */
export function forTabbedControl(e: KeyboardEvent): boolean {
  return tabbedTo !== undefined && e.target === tabbedTo
}
