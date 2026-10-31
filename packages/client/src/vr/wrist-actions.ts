/** What the wrist menu's buttons do. */
import { clearPaint, trimPaint, trimPaintToHint } from "../paint-commands"
import { Hand } from "./hand"
import type { SprayTool } from "./spray-rules"
import type { VrRound } from "./view"
import { WristButton } from "./wrist-button"
import { HintAxis } from "@whereabouts/shared/hints"

export interface WristTargets {
  /** The round, while this player may paint it. */
  painting(): VrRound | undefined
  tools: Record<Hand, { readonly tool: SprayTool; setTool(tool: SprayTool): void }>
  note(text: string): void
  /** The paint has changed: the globe redraws it. */
  repaint(): void
}

export function wristActions(on: WristTargets): Record<WristButton, () => void> {
  // Each acts on the round being painted, and the globe redraws its paint.
  const act = (f: (round: VrRound) => void) => () => {
    const round = on.painting()
    if (!round) return
    f(round)
    on.repaint()
  }
  return {
    [WristButton.UNDO]: act((r) => r.paint.undo()),
    [WristButton.SWAP]: () => {
      const right = on.tools[Hand.RIGHT].tool
      on.tools[Hand.RIGHT].setTool(on.tools[Hand.LEFT].tool)
      on.tools[Hand.LEFT].setTool(right)
    },
    [WristButton.LATITUDE]: act((r) => r.useHint(HintAxis.LATITUDE)),
    [WristButton.LONGITUDE]: act((r) => r.useHint(HintAxis.LONGITUDE)),
    [WristButton.TRIM]: act((r) => {
      void trimPaint(r.paint, r.water).then((note) => {
        on.note(note)
        on.repaint()
      })
    }),
    [WristButton.TRIM_HINT]: act((r) => r.hint && on.note(trimPaintToHint(r.paint, r.hint))),
    [WristButton.CLEAR]: act((r) => clearPaint(r.paint)),
    [WristButton.REDO]: act((r) => r.paint.redo())
  }
}
