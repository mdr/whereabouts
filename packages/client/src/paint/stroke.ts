/** The geometry and touch rules of a brush stroke, apart from the map they act on. */
import type { Px } from "@whereabouts/shared/units"

export interface ScreenPoint {
  x: Px
  y: Px
}

/**
 * Where to stamp as a stroke moves from `from` (the last stamp, if any) to
 * `to`: evenly a quarter of the brush apart (at least 2 px), so a fast drag
 * leaves no gaps and a slow one doesn't pile stamps up.
 */
export const strokePoints = (from: ScreenPoint | undefined, to: ScreenPoint, brushRadius: Px): ScreenPoint[] => {
  if (!from) return [to]
  const dx = to.x - from.x
  const dy = to.y - from.y
  const distance = Math.hypot(dx, dy)
  const step = Math.max(2, brushRadius / 4)
  const steps = Math.floor(distance / step)
  return Array.from({ length: steps }, (_, i) => {
    const t = ((i + 1) * step) / distance
    return { x: from.x + dx * t, y: from.y + dy * t }
  })
}

export enum TouchStep {
  BEGIN = "BEGIN",
  CONTINUE = "CONTINUE",
  /** End the stroke and take its paint back: it was the start of a pinch. */
  ABANDON = "ABANDON",
  IGNORE = "IGNORE"
}

/**
 * One finger uses the current tool; two always pan and zoom. A pinch starts
 * with a single touch for a moment, so a second finger abandons the stroke
 * the first began.
 */
export const touchStart = (fingers: number, canPaint: boolean): TouchStep =>
  fingers === 1 && canPaint ? TouchStep.BEGIN : TouchStep.ABANDON

export const touchMove = (fingers: number, painting: boolean): TouchStep => {
  if (!painting) return TouchStep.IGNORE
  return fingers === 1 ? TouchStep.CONTINUE : TouchStep.ABANDON
}
