import { useEffect } from "preact/hooks"
import { forTabbedControl } from "./keys"
import { SUBMIT } from "./shortcuts"

/** Enter does `act` (nothing, when undefined), unless a Tabbed-to control or a dialog has the keyboard. */
export const useEnterKey = (act: (() => void) | undefined): void => {
  useEffect(() => {
    if (!act) return
    const onKey = (event: KeyboardEvent): void => {
      if (!SUBMIT.matches(event) || event.repeat || forTabbedControl(event)) return
      // A dialog open over the round, an enlarged picture say, has the keyboard.
      if (document.querySelector("dialog[open]")) return
      // A clicked button keeps focus, and Enter would press it as well.
      event.preventDefault()
      act()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })
}
