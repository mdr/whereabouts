// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import type { HintBand } from "@whereabouts/shared/hints"
import type { SprayTool } from "./spray"
import type { VrRound } from "./view"
import { wristActions } from "./wrist-actions"

function makeTool(tool: SprayTool) {
  return {
    tool,
    setTool(t: SprayTool) {
      this.tool = t
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
  const tools = { left: makeTool("erase"), right: makeTool("paint") }
  const actions = wristActions({ painting: () => round, tools, note: (t) => notes.push(t), repaint })
  return { actions, notes, repaint, tools }
}

describe("the wrist menu's buttons", () => {
  it("leave the paint alone while the player isn't painting", () => {
    const { actions, repaint } = makeActions(undefined)
    actions.undo()
    actions.clear()
    expect(repaint).not.toHaveBeenCalled()
  })

  it("undo and redo the round's paint, and redraw it", () => {
    const paint = makePaint()
    const { actions, repaint } = makeActions(makeRound(paint))
    actions.undo()
    actions.redo()
    expect(paint.undo).toHaveBeenCalledOnce()
    expect(paint.redo).toHaveBeenCalledOnce()
    expect(repaint).toHaveBeenCalledTimes(2)
  })

  it("use a hint along the axis pressed", () => {
    const useHint = vi.fn()
    const { actions } = makeActions(makeRound(makePaint(), { useHint }))
    actions.latitude()
    expect(useHint).toHaveBeenCalledWith("latitude")
  })

  it("swap the hands' tools, painting or not", () => {
    const { actions, tools } = makeActions(undefined)
    actions.swap()
    expect([tools.left.tool, tools.right.tool]).toEqual(["paint", "erase"])
  })

  it("say how much trimming to the hint took, at least 1%", () => {
    const paint = makePaint({ trimToHint: vi.fn(() => 0.001) })
    const { actions, notes } = makeActions(makeRound(paint, { hint: {} as HintBand }))
    actions.trimHint()
    expect(notes).toEqual(["Trimmed 1%"])
  })

  it("say so when there is nothing outside the hint to trim", () => {
    const { actions, notes } = makeActions(makeRound(makePaint(), { hint: {} as HintBand }))
    actions.trimHint()
    expect(notes).toEqual(["None outside"])
  })
})
