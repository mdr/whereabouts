/** What the wrist menu's buttons do. */
import { loadLandMask, loadWaterMask } from "../land"
import { sound } from "../sound"
import type { Hand } from "./globe"
import type { SprayTool } from "./spray"
import type { VrRound } from "./view"
import type { WristButton } from "./wrist"

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
    undo: act((r) => r.paint.undo()),
    swap: () => {
      const right = on.tools.right.tool
      on.tools.right.setTool(on.tools.left.tool)
      on.tools.left.setTool(right)
    },
    latitude: act((r) => r.useHint("latitude")),
    longitude: act((r) => r.useHint("longitude")),
    trim: act((r) => {
      const trim = r.water
        ? loadWaterMask().then((mask) => trimmed(r.paint.trimLand(mask), "None on land"))
        : loadLandMask().then((mask) => trimmed(r.paint.trimSea(mask), "None at sea"))
      trim.catch((err: unknown) => {
        console.warn("could not load the trim mask", err)
        on.note("Try again")
      })
    }),
    trimHint: act((r) => r.hint && trimmed(r.paint.trimToHint(r.hint), "None outside")),
    clear: act((r) => {
      if (!r.paint.layer.isEmpty) sound.play("clear")
      r.paint.clear()
    }),
    redo: act((r) => r.paint.redo())
  }
}
