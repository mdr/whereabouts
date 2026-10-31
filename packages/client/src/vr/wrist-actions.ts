/** What the wrist menu's buttons do. */
import { loadLandMask, loadWaterMask } from "../land"
import { sound } from "../sound"
import { Hand } from "./hand"
import type { SprayTool } from "./spray"
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
  const trimmed = (share: number, none: string) => {
    if (share > 0) sound.play("clear")
    on.note(share > 0 ? `Trimmed ${Math.max(1, Math.round(share * 100))}%` : none)
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
      const trim = r.water
        ? loadWaterMask().then((mask) => trimmed(r.paint.trimLand(mask), "None on land"))
        : loadLandMask().then((mask) => trimmed(r.paint.trimSea(mask), "None at sea"))
      trim.catch((err: unknown) => {
        console.warn("could not load the trim mask", err)
        on.note("Try again")
      })
    }),
    [WristButton.TRIM_HINT]: act((r) => r.hint && trimmed(r.paint.trimToHint(r.hint), "None outside")),
    [WristButton.CLEAR]: act((r) => {
      if (!r.paint.layer.isEmpty) sound.play("clear")
      r.paint.clear()
    }),
    [WristButton.REDO]: act((r) => r.paint.redo())
  }
}
