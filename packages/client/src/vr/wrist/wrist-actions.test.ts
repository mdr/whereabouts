// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import type { HintBand } from "@whereabouts/shared/hints"
import type { SprayTool } from "../spray/spray-rules"
import { Tool } from "../../paint/tool"
import type { VrRound } from "../view/view"
import { wristActions } from "./wrist-actions"
import { WristButton } from "./wrist-button"
import { Hand } from "../hands/hand"
import { HintAxis } from "@whereabouts/shared/hints"

function makeTool(tool: SprayTool) {
  return {
    tool,
    setTool(tool: SprayTool) {
      this.tool = tool
    }
  }
}

function makePaint(over: Record<string, unknown> = {}) {
  return { undo: vi.fn(), redo: vi.fn(), trimToHint: vi.fn(() => 0), ...over }
}

function makeRound(paint = makePaint(), over: Partial<VrRound> = {}): VrRound {
  return { paint, useHint: () => {}, hint: undefined, ...over } as unknown as VrRound
}

function makeActions(round: VrRound | undefined) {
  const notes: string[] = []
  const repaint = vi.fn()
  const tools = { [Hand.LEFT]: makeTool(Tool.ERASE), [Hand.RIGHT]: makeTool(Tool.PAINT) }
  const actions = wristActions({ painting: () => round, tools, note: (text) => notes.push(text), repaint })
  return { actions, notes, repaint, tools }
}

describe("the wrist menu's buttons", () => {
  it("leave the paint alone while the player isn't painting", () => {
    const { actions, repaint } = makeActions(undefined)
    actions[WristButton.UNDO]()
    actions[WristButton.CLEAR]()
    expect(repaint).not.toHaveBeenCalled()
  })

  it("undo and redo the round's paint, and redraw it", () => {
    const paint = makePaint()
    const { actions, repaint } = makeActions(makeRound(paint))
    actions[WristButton.UNDO]()
    actions[WristButton.REDO]()
    expect(paint.undo).toHaveBeenCalledOnce()
    expect(paint.redo).toHaveBeenCalledOnce()
    expect(repaint).toHaveBeenCalledTimes(2)
  })

  it("use a hint along the axis pressed", () => {
    const useHint = vi.fn()
    const { actions } = makeActions(makeRound(makePaint(), { useHint }))
    actions[WristButton.LATITUDE]()
    expect(useHint).toHaveBeenCalledWith(HintAxis.LATITUDE)
  })

  it("swap the hands' tools, painting or not", () => {
    const { actions, tools } = makeActions(undefined)
    actions[WristButton.SWAP]()
    expect([tools[Hand.LEFT].tool, tools[Hand.RIGHT].tool]).toEqual([Tool.PAINT, Tool.ERASE])
  })

  it("say how much trimming to the hint took, at least 1%", () => {
    const paint = makePaint({ trimToHint: vi.fn(() => 0.001) })
    const { actions, notes } = makeActions(makeRound(paint, { hint: {} as HintBand }))
    actions[WristButton.TRIM_HINT]()
    expect(notes).toEqual(["Trimmed 1%"])
  })

  it("say so when there is nothing outside the hint to trim", () => {
    const { actions, notes } = makeActions(makeRound(makePaint(), { hint: {} as HintBand }))
    actions[WristButton.TRIM_HINT]()
    expect(notes).toEqual(["None outside"])
  })
})
