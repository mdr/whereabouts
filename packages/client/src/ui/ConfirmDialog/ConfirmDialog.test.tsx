// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test"
import { fireEvent, render, screen } from "@testing-library/preact"
import { ConfirmDialog, endGameRequest, kickRequest, makeHostRequest } from "./ConfirmDialog"
import { confirmDialogTestIds } from "./ConfirmDialogTestIds"

describe("ConfirmDialog", () => {
  it("renders nothing without a request", () => {
    render(<ConfirmDialog request={undefined} onClose={() => {}} />)
    expect(screen.queryAllByTestId(confirmDialogTestIds.dialog)).toHaveLength(0)
  })

  function renderKick() {
    const calls = { confirmed: 0, closed: 0 }
    render(<ConfirmDialog request={kickRequest("Bob", () => calls.confirmed++)} onClose={() => calls.closed++} />)
    return calls
  }

  it("shows the request's title and message", () => {
    renderKick()
    expect(document.body.querySelector("h2")!.textContent).toBe("Remove Bob from the game?")
    expect(document.body.textContent).toContain("rejoin with the code")
  })

  it("confirms, and closes, on the confirm button", () => {
    const calls = renderKick()
    fireEvent.click(document.body.querySelector("button.danger")!)
    expect(calls).toEqual({ confirmed: 1, closed: 1 })
  })

  it.each([
    ["the cancel button", () => fireEvent.click(document.body.querySelector("button:not(.danger)")!)],
    ["the backdrop", () => fireEvent.click(screen.getByTestId(confirmDialogTestIds.backdrop))],
    ["Escape", () => fireEvent.keyDown(window, { key: "Escape" })]
  ])("closes without confirming on %s", (_, dismiss) => {
    const calls = renderKick()
    dismiss()
    expect(calls).toEqual({ confirmed: 0, closed: 1 })
  })

  it("stays open when the dialog itself is clicked", () => {
    const calls = renderKick()
    fireEvent.click(screen.getByTestId(confirmDialogTestIds.dialog))
    expect(calls).toEqual({ confirmed: 0, closed: 0 })
  })

  it("renders into <body>, so a transformed parent such as the toolbar cannot trap it", () => {
    render(
      <div class="hud-bottom" style={{ transform: "translateX(-50%)" }}>
        <ConfirmDialog request={endGameRequest(() => {})} onClose={() => {}} />
      </div>
    )
    const backdrop = screen.getByTestId(confirmDialogTestIds.backdrop)
    expect(backdrop.parentElement).toBe(document.body)
    expect(backdrop.closest(".hud-bottom") ?? undefined).toBeUndefined()
  })

  it("words the end-game request as a destructive action", () => {
    const request = endGameRequest(() => {})
    expect(request.title).toBe("End the game now?")
    expect(request.confirmLabel).toBe("End game")
  })

  it("shows handing over as a plain confirm, and removing as a red one", () => {
    const { unmount } = render(<ConfirmDialog request={makeHostRequest("Bob", () => {})} onClose={() => {}} />)
    const confirm = () => screen.getByTestId<HTMLButtonElement>(confirmDialogTestIds.confirmButton)
    expect(confirm().textContent).toBe("Make Bob host")
    expect(confirm().className).toBe("primary")
    unmount()
    render(<ConfirmDialog request={kickRequest("Bob", () => {})} onClose={() => {}} />)
    expect(confirm().className).toContain("danger")
  })
})
