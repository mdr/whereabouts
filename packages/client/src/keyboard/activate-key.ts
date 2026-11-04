/** The key handler for a focusable element that is not a button: Enter or Space does what a click does. */
export const onActivateKey =
  (activate: () => void): ((event: KeyboardEvent) => void) =>
  (event) => {
    // A key meant for a control inside the element is that control's.
    if (event.target !== event.currentTarget) return
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    activate()
  }
