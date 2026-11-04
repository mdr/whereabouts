import { describe, expect, it, vi, type Mock } from "vite-plus/test"
import { onActivateKey } from "./activate-key"

const press = (
  key: string,
  target: object,
  currentTarget: object = target
): { event: KeyboardEvent; preventDefault: Mock } => {
  const preventDefault = vi.fn()
  return { event: { key, target, currentTarget, preventDefault } as unknown as KeyboardEvent, preventDefault }
}

describe("onActivateKey", () => {
  it("activates on Enter and Space, and keeps the page from scrolling on Space", () => {
    const activate = vi.fn()
    const row = {}
    for (const key of ["Enter", " "]) {
      const { event, preventDefault } = press(key, row)
      onActivateKey(activate)(event)
      expect(preventDefault).toHaveBeenCalledOnce()
    }
    expect(activate).toHaveBeenCalledTimes(2)
  })

  it("ignores other keys and keys meant for a control inside", () => {
    const activate = vi.fn()
    onActivateKey(activate)(press("a", {}).event)
    onActivateKey(activate)(press("Enter", {}, {}).event)
    expect(activate).not.toHaveBeenCalled()
  })
})
