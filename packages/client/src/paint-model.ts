/**
 * One player's paint for a round, with its undo history, the countries the
 * Fill tool has filled, and the trims. Knows nothing of the map: the paint
 * controller draws it and feeds it strokes.
 */
import { batch, computed, signal, type ReadonlySignal } from "@preact/signals"
import { FILL_DENSITY } from "@whereabouts/shared/fill"
import { PaintLayer, resolutionForTolerance } from "@whereabouts/shared/paint"
import { paintAmount, trimLand, trimSea, type LandMask, type WaterMask } from "@whereabouts/shared/land"
import { trimToHint, type HintBand } from "@whereabouts/shared/hints"
import { h3Res, type H3Cell } from "@whereabouts/shared/h3"
import type { FlagCode } from "@whereabouts/shared/ids"
import type { FlagQuestion } from "@whereabouts/shared/flags"
import type { LatLon } from "@whereabouts/shared/geo"
import type { CountryFiller } from "./fill"

/** How near a point a small country's answer counts as under it, in pixels, for the Fill tool. */
export const FILL_SMALL_PX = 12
const HISTORY_LIMIT = 50
const SETTLE_MS = 200

/** The countries the Fill tool works with (see fill.ts). */
export type Filler = Pick<CountryFiller, "countryAt" | "outline" | "cells">

/** One undo step: the cells, and which countries are filled. */
interface Snapshot {
  cells: Map<H3Cell, number>
  fills: Map<FlagCode, H3Cell[]>
}

/**
 * A value read from the layer, recomputed when `version` changes. The layer
 * is mutated in place, which no signal can see, so every change to it bumps
 * a version counter, and this is the one place that reads a counter only to
 * depend on it.
 */
function following<T>(version: ReadonlySignal<number>, read: () => T): ReadonlySignal<T> {
  return computed(() => {
    // oxlint-disable-next-line typescript/no-unused-expressions -- the read is the dependency
    version.value
    return read()
  })
}

export class PaintModel {
  readonly floor = signal(0.05)
  /** Increments whenever the paint changes (see `changed`); cheap dependency for panels. */
  readonly version = signal(0)
  /**
   * Follows `version` about 200 ms after the last change. Panels that do
   * heavier work per update (blob detection, live scoring) depend on this so
   * they do not run on every animation frame mid-stroke.
   */
  readonly settledVersion = signal(0)
  /** Whether nothing is painted. */
  readonly isEmpty = following(this.version, () => this.layer.isEmpty)
  /** The layer's size and resolutions, for the dev panel. */
  readonly stats = following(this.version, () => ({
    res: this.layer.res,
    size: this.layer.size,
    resolutionCounts: this.layer.resolutionCounts()
  }))
  /** The painted cells as of `settledVersion`, for live scoring. */
  readonly settledCells = following(this.settledVersion, () => [...this.layer.toCells()])
  /** Connected blobs as of `settledVersion`, largest first; none when nothing is painted. */
  readonly settledBlobs = following(this.settledVersion, () => this.layer.blobs())
  /** The tool of the stroke being held, or undefined; drives the spray and eraser sounds. */
  readonly stroking = signal<"paint" | "erase" | undefined>(undefined)
  /** The current question's tolerance (used by dev tooling). */
  readonly toleranceKm = signal(100)
  private readonly _fillable = signal(false)
  /** Whether the Fill tool is offered (see `offerFill`). */
  readonly fillable: ReadonlySignal<boolean> = this._fillable
  private readonly _canUndo = signal(false)
  readonly canUndo: ReadonlySignal<boolean> = this._canUndo
  private readonly _canRedo = signal(false)
  readonly canRedo: ReadonlySignal<boolean> = this._canRedo

  private _layer = new PaintLayer(h3Res(4))
  private filler: Filler | undefined = undefined
  /** The countries filled, by flag code, with the cells each was filled with. */
  private fills = new Map<FlagCode, H3Cell[]>()
  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []
  private settleTimer: ReturnType<typeof setTimeout> | undefined = undefined
  private readonly unsubscribe: () => void

  constructor() {
    this.unsubscribe = this.version.subscribe((v) => {
      clearTimeout(this.settleTimer)
      this.settleTimer = setTimeout(() => {
        this.settleTimer = undefined
        this.settledVersion.value = v
      }, SETTLE_MS)
    })
  }

  get layer(): PaintLayer {
    return this._layer
  }

  dispose(): void {
    clearTimeout(this.settleTimer)
    this.unsubscribe()
  }

  /** The paint changed: by default `version` moves at once. */
  protected changed(): void {
    this.publish()
  }

  /** Count the paint's changes so far in `version`. */
  publish(): void {
    this.version.value++
  }

  /** Start a fresh layer sized for a question's tolerance. */
  reset(toleranceKm: number): void {
    batch(() => {
      this.toleranceKm.value = toleranceKm
      this._layer = new PaintLayer(resolutionForTolerance(toleranceKm))
      this.fills = new Map()
      this.version.value++
      this.clearHistory()
    })
  }

  /**
   * Replace the paint with these cells (at the layer's resolution or
   * coarser), as a fresh start: nothing filled and nothing to undo.
   */
  restore(cells: Record<H3Cell, number>): void {
    batch(() => {
      this._layer = PaintLayer.fromRecord(this._layer.res, cells)
      this.fills = new Map()
      this.version.value++
      this.clearHistory()
    })
  }

  clear(): void {
    if (this._layer.isEmpty) return
    this.pushHistory()
    this._layer.clear()
    this.fills = new Map()
    this.changed()
  }

  // ---- the Fill tool --------------------------------------------------------

  /** The countries to fill with; kept once given. */
  useFiller(filler: Filler): void {
    this.filler ??= filler
  }

  /** Offer the Fill tool, when there are countries to fill with. */
  offerFill(on: boolean): void {
    this._fillable.value = on && this.filler !== undefined
  }

  /** The country at a point, or a small one within FILL_SMALL_PX pixels of it at `kmPerPx`. */
  countryAt(at: LatLon, kmPerPx: number): FlagQuestion | undefined {
    return this.filler?.countryAt(at, kmPerPx, FILL_SMALL_PX)
  }

  /** The country's outline, for the cursor. */
  outline(f: FlagQuestion): GeoJSON.MultiPolygon | undefined {
    return this.filler?.outline(f)
  }

  isFilled(f: FlagQuestion): boolean {
    return this.fills.has(f.flag)
  }

  /**
   * Fill the country at a point with an even coat (see fill.ts), or take the
   * fill off if it is already filled; one undoable step. Nothing at sea.
   */
  fillAt(at: LatLon, kmPerPx: number): void {
    const f = this.countryAt(at, kmPerPx)
    if (f) this.fill(f)
  }

  /** As fillAt, from outside the map: a small country counts within `nearKm`. */
  fillOutside(at: LatLon, nearKm: number): void {
    this.fillAt(at, nearKm / FILL_SMALL_PX)
  }

  private fill(f: FlagQuestion): void {
    this.pushHistory()
    const filled = this.fills.get(f.flag)
    if (filled) {
      this._layer.removeCoat(filled, FILL_DENSITY)
      this.fills.delete(f.flag)
    } else {
      const cells = this.filler!.cells(f, this._layer.res)
      this._layer.addCoat(cells, FILL_DENSITY)
      this.fills.set(f.flag, cells)
    }
    this.changed()
  }

  // ---- trims ----------------------------------------------------------------

  /**
   * Drop the paint out at sea (see land.ts) as one undoable step. Returns
   * the share of the paint's mass removed: 0 when there was none at sea.
   */
  trimSea(mask: LandMask): number {
    return this.keepOnly(trimSea(this._layer.cells, mask, this._layer.res))
  }

  /** Drop the paint on dry land, for a lake or sea, as trimSea drops it at sea. */
  trimLand(mask: WaterMask): number {
    return this.keepOnly(trimLand(this._layer.cells, mask, this._layer.res))
  }

  /** Drop the paint outside a hint's band, as trimSea drops it at sea. */
  trimToHint(band: HintBand): number {
    return this.keepOnly(trimToHint(this._layer.cells, band, this._layer.res))
  }

  private keepOnly(kept: Map<H3Cell, number>): number {
    const share = 1 - paintAmount(kept) / paintAmount(this._layer.cells)
    if (!(share > 1e-9)) return 0
    this.pushHistory()
    this._layer.replaceCells(kept)
    this.changed()
    return share
  }

  // ---- strokes --------------------------------------------------------------

  /** One undo step for every stamp until `endStroke`. */
  beginStroke(tool: "paint" | "erase"): void {
    this.pushHistory()
    this.stroking.value = tool
  }

  /** Negative strength erases. */
  stamp(at: LatLon, radiusKm: number, strength: number): void {
    this._layer.stamp(at, radiusKm, strength)
    this.changed()
  }

  endStroke(): void {
    this.stroking.value = undefined
  }

  /** End a stroke and take its paint back, leaving nothing to redo. */
  abandonStroke(): void {
    this.endStroke()
    this.undo()
    this.redoStack.pop()
    this.syncHistoryFlags()
  }

  // ---- undo / redo: one entry per stroke, clear, fill or trim ---------------

  private snapshot(): Snapshot {
    return { cells: new Map(this._layer.cells), fills: new Map(this.fills) }
  }

  private restoreSnapshot(s: Snapshot): void {
    this._layer.replaceCells(s.cells)
    this.fills = s.fills
  }

  private pushHistory(): void {
    this.undoStack.push(this.snapshot())
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift()
    this.redoStack = []
    this.syncHistoryFlags()
  }

  private clearHistory(): void {
    this.undoStack = []
    this.redoStack = []
    this.syncHistoryFlags()
  }

  undo(): void {
    const prev = this.undoStack.pop()
    if (!prev) return
    this.redoStack.push(this.snapshot())
    this.restoreSnapshot(prev)
    this.syncHistoryFlags()
    this.changed()
  }

  redo(): void {
    const next = this.redoStack.pop()
    if (!next) return
    this.undoStack.push(this.snapshot())
    this.restoreSnapshot(next)
    this.syncHistoryFlags()
    this.changed()
  }

  private syncHistoryFlags(): void {
    this._canUndo.value = this.undoStack.length > 0
    this._canRedo.value = this.redoStack.length > 0
  }
}
