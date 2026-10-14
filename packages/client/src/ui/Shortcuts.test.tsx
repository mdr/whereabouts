// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render } from "@testing-library/preact"
import { Shortcuts, ShortcutsButton, shortcutsOpen } from "./Shortcuts"

const card = () => document.body.querySelector(".shortcuts") ?? undefined
const press = (key: string, target: Window | Element = window) => fireEvent.keyDown(target, { key, bubbles: true })

afterEach(() => {
  cleanup()
  shortcutsOpen.value = false
})

describe("Shortcuts", () => {
  it("opens and closes with ?, and closes with Escape", () => {
    render(<Shortcuts />)
    expect(card()).toBeUndefined()
    press("?")
    expect(card()).not.toBeUndefined()
    press("?")
    expect(card()).toBeUndefined()
    press("?")
    press("Escape")
    expect(card()).toBeUndefined()
  })

  it("opens from the toolbar button too, and closes on a click outside the card", () => {
    const { container } = render(
      <>
        <ShortcutsButton />
        <Shortcuts />
      </>
    )
    fireEvent.click(container.querySelector(".shortcuts-button")!)
    expect(card()).not.toBeUndefined()
    fireEvent.click(card()!) // inside: stays
    expect(card()).not.toBeUndefined()
    fireEvent.click(document.body.querySelector(".shortcuts-backdrop")!)
    expect(card()).toBeUndefined()
  })

  it("ignores ? typed into a field", () => {
    const { container } = render(
      <>
        <input />
        <Shortcuts />
      </>
    )
    press("?", container.querySelector("input")!)
    expect(card()).toBeUndefined()
  })

  it("lists Enter only in practice, where it works", () => {
    const { unmount } = render(<Shortcuts />)
    press("?")
    expect(card()!.textContent).toContain("Brush smaller / larger")
    expect(card()!.textContent).not.toContain("Enter")
    unmount()
    render(<Shortcuts practice />)
    press("?")
    expect(card()!.textContent).toContain("Submit / next question")
  })
})
