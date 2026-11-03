/**
 * Clear and the trims, as the page's brush bar and the VR wrist menu both
 * offer them. A trim is one undoable step and returns a short note saying
 * what it did; the whoosh plays only when paint went.
 */
import { ClientErrorKind } from "@whereabouts/shared/protocol/client-error"
import { reportClientError } from "../net/client-error/report-client-error"
import type { HintBand } from "@whereabouts/shared/hints"
import { loadLandMask, loadWaterMask } from "../data/land"
import type { PaintModel } from "./paint-model"
import { sound } from "../sound/sound"

export const clearPaint = (paint: Pick<PaintModel, "layer" | "clear">): void => {
  if (!paint.layer.isEmpty) sound.play("clear")
  paint.clear()
}

/** Trim sea, or in a lake or sea round Trim land. Its mask loads on first use. */
export const trimPaint = async (paint: Pick<PaintModel, "trimSea" | "trimLand">, water: boolean): Promise<string> => {
  try {
    const share = water ? paint.trimLand(await loadWaterMask()) : paint.trimSea(await loadLandMask())
    return trimmed(share, water ? "None on land" : "None at sea")
  } catch (error) {
    console.warn("could not load the trim mask", error)
    reportClientError(ClientErrorKind.DATA_LOAD, error)
    return "Try again"
  }
}

export const trimPaintToHint = (paint: Pick<PaintModel, "trimToHint">, band: HintBand): string =>
  trimmed(paint.trimToHint(band), "None outside")

const trimmed = (share: number, none: string): string => {
  if (share > 0) sound.play("clear")
  return share > 0 ? `Trimmed ${Math.max(1, Math.round(share * 100))}%` : none
}
