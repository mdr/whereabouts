/** Both hands' spraying as one undo step. */
import type { PaintModel } from "../paint-model"
import { Tool } from "../tool"
import type { SprayTool } from "./spray-rules"

export interface HandAtWork {
  tool: SprayTool
  /** The eraser's tip on the globe. */
  touching: boolean
  /** Gripping the globe or the picture. */
  busy: boolean
  trigger: number
  /** Its ray meets the globe. */
  aimed: boolean
}

/** The tool of the first hand rubbing or spraying the globe, if one is; Fill makes no stroke. */
export function strokeTool(hands: HandAtWork[], onMenu: boolean, triggerDead: number): SprayTool | undefined {
  if (onMenu) return undefined
  return hands.find((h) => h.touching || (!h.busy && h.tool !== Tool.FILL && h.trigger > triggerDead && h.aimed))?.tool
}

export type Strokes = Pick<PaintModel, "beginStroke" | "endStroke">

/** Begun by whichever hand starts, ended once neither sprays. */
export class PairedStroke {
  private open = false
  private readonly paint: () => Strokes | undefined

  constructor(paint: () => Strokes | undefined) {
    this.paint = paint
  }

  begin(tool: SprayTool | undefined): void {
    if (!tool || tool === Tool.FILL || this.open) return
    this.paint()?.beginStroke(tool)
    this.open = true
  }

  end(): void {
    if (!this.open) return
    this.paint()?.endStroke()
    this.open = false
  }
}
