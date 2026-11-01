import { describe, expect, it, vi } from "vite-plus/test"
import { listedShortcuts, runPaintKey, type KeyPress, type PaintKeyTarget } from "./shortcuts"
import { Tool } from "../paint/tool"

const press = (key: string, mods: Partial<KeyPress> = {}): KeyPress => ({
  key,
  code: "",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods
})

function makeTarget({ enabled = true, canFill = true } = {}) {
  return {
    enabled: () => enabled,
    canFill: () => canFill,
    setTool: vi.fn<PaintKeyTarget["setTool"]>(),
    resizeBrush: vi.fn<PaintKeyTarget["resizeBrush"]>(),
    undo: vi.fn(),
    redo: vi.fn()
  }
}

describe("the paint keys", () => {
  it("undo with Ctrl+Z, and redo with Ctrl+Shift+Z or Ctrl+Y", () => {
    const t = makeTarget()
    runPaintKey(press("z", { ctrlKey: true }), t)
    expect(t.undo).toHaveBeenCalledTimes(1)
    expect(t.redo).not.toHaveBeenCalled()
    runPaintKey(press("Z", { ctrlKey: true, shiftKey: true }), t)
    runPaintKey(press("y", { metaKey: true }), t)
    expect(t.redo).toHaveBeenCalledTimes(2)
    expect(t.undo).toHaveBeenCalledTimes(1)
  })

  it("pick tools with 1 to 4, Fill only when there is one", () => {
    const t = makeTarget()
    for (const key of ["1", "2", "3", "4"]) runPaintKey(press(key), t)
    expect(t.setTool.mock.calls.map(([tool]) => tool)).toEqual([Tool.PAN, Tool.PAINT, Tool.ERASE, Tool.FILL])
    const noFill = makeTarget({ canFill: false })
    runPaintKey(press("4"), noFill)
    expect(noFill.setTool).not.toHaveBeenCalled()
  })

  it("shrink the brush with [ and grow it with ]", () => {
    const t = makeTarget()
    runPaintKey(press("["), t)
    runPaintKey(press("]"), t)
    const [smaller, larger] = t.resizeBrush.mock.calls.map(([factor]) => factor)
    expect(smaller).toBeLessThan(1)
    expect(larger).toBeGreaterThan(1)
  })

  it("do nothing while painting is off", () => {
    const t = makeTarget({ enabled: false })
    expect(runPaintKey(press("z", { ctrlKey: true }), t)).toBe(false)
    expect(runPaintKey(press("2"), t)).toBe(false)
    expect(t.undo).not.toHaveBeenCalled()
    expect(t.setTool).not.toHaveBeenCalled()
  })

  it("leave other keys alone", () => {
    const t = makeTarget()
    expect(runPaintKey(press("z"), t)).toBe(false)
    expect(runPaintKey(press("Enter"), t)).toBe(false)
    expect(runPaintKey(press("?"), t)).toBe(false)
  })
})

describe("the listed shortcuts", () => {
  const actions = (practice: boolean) => listedShortcuts(practice).map((s) => s.action)

  it("list Enter only in practice", () => {
    expect(actions(true)).toContain("Submit / next question")
    expect(actions(false)).not.toContain("Submit / next question")
  })

  it("list every paint key that works", () => {
    const listed = listedShortcuts(false).flatMap((s) => s.combos.map((c) => c.keys.join("+")))
    expect(listed).toEqual(expect.arrayContaining(["1", "2", "3", "4", "[", "]", "Ctrl+Z", "Ctrl+Shift+Z", "Ctrl+Y"]))
  })
})
