/** What the wrist menu's buttons do. */
import { clearPaint, trimPaint, trimPaintToHint } from "../../paint/paint-commands"
import { Hand } from "../hands/hand"
import type { SprayTool } from "../spray/spray-rules"
import type { VrRound } from "../view/view"
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

export const wristActions = (on: WristTargets): Record<WristButton, () => void> => {
  // Each acts on the round being painted, and the globe redraws its paint.
  const act = (use: (round: VrRound) => void) => () => {
    const round = on.painting()
    if (!round) return
    use(round)
    on.repaint()
  }
  return {
    [WristButton.UNDO]: act((round) => round.paint.undo()),
    [WristButton.SWAP]: () => {
      const right = on.tools[Hand.RIGHT].tool
      on.tools[Hand.RIGHT].setTool(on.tools[Hand.LEFT].tool)
      on.tools[Hand.LEFT].setTool(right)
    },
    [WristButton.LATITUDE]: act((round) => round.useHint(HintAxis.LATITUDE)),
    [WristButton.LONGITUDE]: act((round) => round.useHint(HintAxis.LONGITUDE)),
    [WristButton.TRIM]: act((round) => {
      void trimPaint(round.paint, round.water).then((note) => {
        on.note(note)
        on.repaint()
      })
    }),
    [WristButton.TRIM_HINT]: act((round) => round.hint && on.note(trimPaintToHint(round.paint, round.hint))),
    [WristButton.CLEAR]: act((round) => clearPaint(round.paint)),
    [WristButton.REDO]: act((round) => round.paint.redo())
  }
}
