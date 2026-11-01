import { describe, expect, it, vi } from "vite-plus/test"
import { PairedStroke, strokeTool, type HandAtWork } from "./stroke"
import { Tool } from "../../paint/tool"

const DEAD = 0.05
const idle: HandAtWork = { tool: Tool.PAINT, touching: false, busy: false, trigger: 0, aimed: true }
const hand = (over: Partial<HandAtWork>): HandAtWork => ({ ...idle, ...over })

describe("which hand starts a stroke", () => {
  it("one spraying at the globe", () => {
    expect(strokeTool([idle, hand({ tool: Tool.ERASE, trigger: 1 })], false, DEAD)).toBe(Tool.ERASE)
  })

  it("one rubbing the globe with the eraser's tip, trigger or not", () => {
    expect(strokeTool([hand({ tool: Tool.ERASE, touching: true })], false, DEAD)).toBe(Tool.ERASE)
  })

  it("none pulling the trigger at nothing, while gripping, or with the pail", () => {
    for (const controller of [
      hand({ trigger: 1, aimed: false }),
      hand({ trigger: 1, busy: true }),
      hand({ trigger: DEAD }),
      hand({ trigger: 1, tool: Tool.FILL })
    ])
      expect(strokeTool([controller], false, DEAD)).toBeUndefined()
  })

  it("none while pointing at a menu", () => {
    expect(strokeTool([hand({ trigger: 1 })], true, DEAD)).toBeUndefined()
  })
})

describe("a stroke made with both hands", () => {
  const setup = () => {
    const paint = { beginStroke: vi.fn(), endStroke: vi.fn() }
    return { paint, stroke: new PairedStroke(() => paint) }
  }

  it("is one undo step, begun by the first hand", () => {
    const { paint, stroke } = setup()
    stroke.begin(Tool.PAINT)
    stroke.begin(Tool.ERASE)
    stroke.end()
    expect(paint.beginStroke.mock.calls).toEqual([[Tool.PAINT]])
    expect(paint.endStroke).toHaveBeenCalledTimes(1)
  })

  it("is not begun by the pail, and not ended unless begun", () => {
    const { paint, stroke } = setup()
    stroke.begin(Tool.FILL)
    stroke.begin(undefined)
    stroke.end()
    expect(paint.beginStroke).not.toHaveBeenCalled()
    expect(paint.endStroke).not.toHaveBeenCalled()
  })

  it("begins afresh once ended", () => {
    const { paint, stroke } = setup()
    stroke.begin(Tool.PAINT)
    stroke.end()
    stroke.begin(Tool.ERASE)
    expect(paint.beginStroke.mock.calls).toEqual([[Tool.PAINT], [Tool.ERASE]])
  })
})
