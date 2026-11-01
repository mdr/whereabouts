import { describe, expect, it, vi } from "vite-plus/test"
import { listedShortcuts, runPaintKey, type KeyPress } from "./shortcuts"
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

const makeTarget = ({ enabled = true, canFill = true } = {}) => ({
  enabled: () => enabled,
  canFill: () => canFill,
  setTool: vi.fn<(tool: Tool) => void>(),
  resizeBrush: vi.fn<(factor: number) => void>(),
  undo: vi.fn(),
  redo: vi.fn()
})

describe("the paint keys", () => {
  it("undo with Ctrl+Z, and redo with Ctrl+Shift+Z or Ctrl+Y", () => {
    const target = makeTarget()
    runPaintKey(press("z", { ctrlKey: true }), target)
    expect(target.undo).toHaveBeenCalledTimes(1)
    expect(target.redo).not.toHaveBeenCalled()
    runPaintKey(press("Z", { ctrlKey: true, shiftKey: true }), target)
    runPaintKey(press("y", { metaKey: true }), target)
    expect(target.redo).toHaveBeenCalledTimes(2)
    expect(target.undo).toHaveBeenCalledTimes(1)
  })

  it("pick tools with 1 to 4, Fill only when there is one", () => {
    const target = makeTarget()
    for (const key of ["1", "2", "3", "4"]) runPaintKey(press(key), target)
    expect(target.setTool.mock.calls.map(([tool]) => tool)).toEqual([Tool.PAN, Tool.PAINT, Tool.ERASE, Tool.FILL])
    const noFill = makeTarget({ canFill: false })
    runPaintKey(press("4"), noFill)
    expect(noFill.setTool).not.toHaveBeenCalled()
  })

  it("shrink the brush with [ and grow it with ]", () => {
    const target = makeTarget()
    runPaintKey(press("["), target)
    runPaintKey(press("]"), target)
    const [smaller, larger] = target.resizeBrush.mock.calls.map(([factor]) => factor)
    expect(smaller).toBeLessThan(1)
    expect(larger).toBeGreaterThan(1)
  })

  it("do nothing while painting is off", () => {
    const target = makeTarget({ enabled: false })
    expect(runPaintKey(press("z", { ctrlKey: true }), target)).toBe(false)
    expect(runPaintKey(press("2"), target)).toBe(false)
    expect(target.undo).not.toHaveBeenCalled()
    expect(target.setTool).not.toHaveBeenCalled()
  })

  it("leave other keys alone", () => {
    const target = makeTarget()
    expect(runPaintKey(press("z"), target)).toBe(false)
    expect(runPaintKey(press("Enter"), target)).toBe(false)
    expect(runPaintKey(press("?"), target)).toBe(false)
  })
})

describe("the listed shortcuts", () => {
  const actions = (practice: boolean) => listedShortcuts(practice).map((shortcut) => shortcut.action)

  it("list Enter only in practice", () => {
    expect(actions(true)).toContain("Submit / next question")
    expect(actions(false)).not.toContain("Submit / next question")
  })

  it("list every paint key that works", () => {
    const listed = listedShortcuts(false).flatMap((shortcut) => shortcut.combos.map((combo) => combo.keys.join("+")))
    expect(listed).toEqual(expect.arrayContaining(["1", "2", "3", "4", "[", "]", "Ctrl+Z", "Ctrl+Shift+Z", "Ctrl+Y"]))
  })
})
