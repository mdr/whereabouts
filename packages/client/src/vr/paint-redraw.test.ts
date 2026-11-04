import { describe, expect, it, vi, type Mock } from "vite-plus/test"
import { signal, type Signal } from "@preact/signals"
import { h3Resolution } from "@whereabouts/shared/h3"
import { PaintLayer } from "@whereabouts/shared/paint/paint"
import type { Globe } from "./globe/globe"
import { PaintRedraw } from "./paint-redraw"
import { VrPaintsType, VrViewType, type VrPaints, type VrReveal, type VrRound, type VrView } from "./view/view"

const layerWithPaint = (lat: number): PaintLayer => {
  const layer = new PaintLayer(h3Resolution(4))
  layer.stamp({ lat, lon: 0 }, 50, 1)
  return layer
}

const makeRound = (layer = layerWithPaint(0)): { round: VrRound; version: Signal<number> } => {
  const version = signal(0)
  return { round: { paint: { layer, version }, colour: "#ff0000" } as unknown as VrRound, version }
}

const makeRedraw = (): { redraw: PaintRedraw; showPaint: Mock } => {
  const showPaint = vi.fn()
  return { redraw: new PaintRedraw({ showPaint } as unknown as Globe), showPaint }
}

const revealOf = (round: VrRound, paints: VrPaints): VrView => ({
  type: VrViewType.REVEAL,
  round,
  reveal: { paints } as VrReveal
})

describe("PaintRedraw", () => {
  it("draws the round's paint once, then again only when it changes, at most every tenth of a second", () => {
    const { redraw, showPaint } = makeRedraw()
    const { round, version } = makeRound()
    redraw.watch(round)
    redraw.maybeRedraw(undefined, round, 1)
    redraw.maybeRedraw(undefined, round, 2)
    expect(showPaint).toHaveBeenCalledTimes(1)
    expect(redraw.shownCells).toBe(round.paint.layer.toGeoJSON().features.length)

    version.value++
    redraw.maybeRedraw(undefined, round, 2.05)
    expect(showPaint).toHaveBeenCalledTimes(2)
    version.value++
    redraw.maybeRedraw(undefined, round, 2.1)
    expect(showPaint).toHaveBeenCalledTimes(2)
    redraw.maybeRedraw(undefined, round, 2.16)
    expect(showPaint).toHaveBeenCalledTimes(3)
    redraw.stop()
  })

  it("stops following the paint once stopped", () => {
    const { redraw, showPaint } = makeRedraw()
    const { round, version } = makeRound()
    redraw.watch(round)
    redraw.maybeRedraw(undefined, round, 1)
    redraw.stop()
    version.value++
    redraw.maybeRedraw(undefined, round, 5)
    expect(showPaint).toHaveBeenCalledTimes(1)
  })

  it("at the reveal draws the players' paint the table picks, and draws again when the pick changes", () => {
    const { redraw, showPaint } = makeRedraw()
    const { round } = makeRound(new PaintLayer(h3Resolution(4)))
    const north = { layer: layerWithPaint(40), colour: "#00ff00" }
    const south = { layer: layerWithPaint(-40), colour: "#0000ff" }
    const everyone = revealOf(round, { type: VrPaintsType.PLAYERS, paints: [north, south] })
    redraw.watch(round)
    redraw.viewChanged(everyone)
    redraw.maybeRedraw(everyone, round, 1)
    const cells = (layer: PaintLayer): number => layer.toGeoJSON().features.length
    expect(redraw.shownCells).toBe(cells(north.layer) + cells(south.layer))

    const justNorth = revealOf(round, { type: VrPaintsType.PLAYERS, paints: [north] })
    redraw.viewChanged(justNorth)
    redraw.maybeRedraw(justNorth, round, 2)
    expect(redraw.shownCells).toBe(cells(north.layer))
    redraw.viewChanged(justNorth)
    redraw.maybeRedraw(justNorth, round, 3)
    expect(showPaint).toHaveBeenCalledTimes(2)
    redraw.stop()
  })
})
