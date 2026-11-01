import { effect } from "@preact/signals"
import type { Seconds } from "@whereabouts/shared/units"
import { THEME } from "../map/themes"
import { PAINT_RADIUS, type Globe } from "./globe/globe"
import { paintGeometry } from "./globe/paint-mesh"
import { colouredPaint } from "./reveal"
import { paintsKey } from "./shown"
import { VrPaintsType, VrViewType, type VrRound, type VrView } from "./view/view"

/** Rebuilding the paint is the costly part of a stroke, so at most this often. */
const PAINT_REDRAW: Seconds = 0.1

/** When the globe's paint is out of date, and drawing it again, not too often. */
export class PaintRedraw {
  /** Cells of paint last drawn. */
  shownCells = 0
  private dirty = true
  private lastDraw: Seconds = 0
  private key = ""
  private stopWatch: (() => void) | undefined = undefined

  constructor(private readonly globe: Globe) {}

  /** Redraw when this round's paint changes. */
  watch(round: VrRound | undefined): void {
    this.dirty = true
    this.stopWatch?.()
    this.stopWatch = round
      ? effect(() => {
          // oxlint-disable-next-line typescript/no-unused-expressions -- the read is the dependency
          round.paint.version.value
          this.dirty = true
        })
      : undefined
  }

  markDirty(): void {
    this.dirty = true
  }

  /** Whose paint the view shows changing means a redraw. */
  viewChanged(view: VrView): void {
    const key = paintsKey(view)
    if (key === this.key) return
    this.key = key
    this.dirty = true
  }

  stop(): void {
    this.stopWatch?.()
    this.stopWatch = undefined
  }

  maybeRedraw(view: VrView | undefined, round: VrRound | undefined, now: Seconds): void {
    if (!round || !this.dirty || now - this.lastDraw < PAINT_REDRAW) return
    const shown = view?.type === VrViewType.REVEAL ? view.reveal.paints : undefined
    const paints = shown?.type === VrPaintsType.PLAYERS ? shown.paints : undefined
    const paint = paints ? colouredPaint(paints) : round.paint.layer.toGeoJSON()
    this.globe.showPaint(paintGeometry(paint, THEME, PAINT_RADIUS, paints ? undefined : round.colour))
    this.shownCells = paint.features.length
    this.dirty = false
    this.lastDraw = now
  }
}
