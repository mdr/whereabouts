import type { RefObject } from "preact"
import { useLayoutEffect } from "preact/hooks"
import { useElementRef } from "./element-ref"

/**
 * A ref for a `<dialog>` that is open modally while `open`: the browser traps
 * focus in it, makes the page behind inert and puts it above everything. Opened
 * before paint, so a key pressed as soon as it shows is heard. The dialog
 * itself has focus, so no control shows a ring that a click would not have.
 */
export const useModalDialog = (open = true): RefObject<HTMLDialogElement> => {
  const ref = useElementRef<HTMLDialogElement>()
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!open || !dialog || dialog.open) return
    dialog.showModal()
    dialog.focus()
  }, [open])
  return ref
}

/** Escape asks to close; the owner of the state does the closing. */
export const onDialogCancel =
  (close: () => void) =>
  (event: Event): void => {
    event.preventDefault()
    close()
  }
