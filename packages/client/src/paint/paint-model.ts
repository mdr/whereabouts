/**
 * One player's paint for a round, with its undo history, the countries or
 * islands the Fill tool has filled, and the trims. Knows nothing of the map: the paint
 * controller draws it and feeds it strokes.
 */
import { batch, computed, signal, type ReadonlySignal } from "@preact/signals"
import { FILL_DENSITY } from "@whereabouts/shared/paint/fill"
import { paintBlobs } from "@whereabouts/shared/paint/blobs"
import { PaintLayer, resolutionForTolerance } from "@whereabouts/shared/paint/paint"
import { paintAmount, trimLand, trimSea, type LandMask, type WaterMask } from "@whereabouts/shared/paint/land"
import { trimToHint, type HintBand } from "@whereabouts/shared/hints"
import { h3Resolution, type H3Cell } from "@whereabouts/shared/h3"
import type { LatLon } from "@whereabouts/shared/geo"
import type { StrokeTool } from "./tool"
import type { FillTarget, FillType, Filler } from "./fill-target"
import type { Km, Ms } from "@whereabouts/shared/units"
import type { TimeoutHandle } from "@whereabouts/shared/timeout"

const HISTORY_LIMIT = 50
const SETTLE: Ms = 200

/** One undo step: the cells, and what is filled. */
interface Snapshot {
  cells: Map<H3Cell, number>
  fills: Map<string, H3Cell[]>
}

/**
 * A value read from the layer, recomputed when `version` changes. The layer
 * is mutated in place, which no signal can see, so every change to it bumps
 * a version counter, and this is the one place that reads a counter only to
 * depend on it.
 */
const following = <T>(version: ReadonlySignal<number>, read: () => T): ReadonlySignal<T> =>
  computed(() => {
    // oxlint-disable-next-line typescript/no-unused-expressions -- the read is the dependency
    version.value
    return read()
  })

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
    resolution: this.layer.resolution,
    size: this.layer.size,
    resolutionCounts: this.layer.resolutionCounts()
  }))
  /** The painted cells as of `settledVersion`, for live scoring. */
  readonly settledCells = following(this.settledVersion, () => [...this.layer.toCells()])
  /** Connected blobs as of `settledVersion`, largest first; none when nothing is painted. */
  readonly settledBlobs = following(this.settledVersion, () => paintBlobs(this.layer))
  /** The tool of the stroke being held, or undefined; drives the spray and eraser sounds. */
  readonly stroking = signal<StrokeTool | undefined>(undefined)
  /** The current question's tolerance (used by dev tooling). */
  readonly tolerance = signal<Km>(100)
  private readonly _fillType = signal<FillType | undefined>(undefined)
  /** What the Fill tool fills, when it is offered (see `offerFill`). */
  readonly fillType: ReadonlySignal<FillType | undefined> = this._fillType
  /** Whether the Fill tool is offered. */
  readonly fillable: ReadonlySignal<boolean> = computed(() => this._fillType.value !== undefined)
  private readonly _canUndo = signal(false)
  readonly canUndo: ReadonlySignal<boolean> = this._canUndo
  private readonly _canRedo = signal(false)
  readonly canRedo: ReadonlySignal<boolean> = this._canRedo

  private _layer = new PaintLayer(h3Resolution(4))
  private readonly fillers = new Map<FillType, Filler>()
  private filler: Filler | undefined = undefined
  /** What is filled, by its id, with the cells each was filled with. */
  private fills = new Map<string, H3Cell[]>()
  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []
  private settleTimer: TimeoutHandle | undefined = undefined
  private readonly unsubscribe: () => void

  constructor() {
    this.unsubscribe = this.version.subscribe((version) => {
      clearTimeout(this.settleTimer)
      this.settleTimer = setTimeout(() => {
        this.settleTimer = undefined
        this.settledVersion.value = version
      }, SETTLE)
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
  reset(tolerance: Km): void {
    batch(() => {
      this.tolerance.value = tolerance
      this._layer = new PaintLayer(resolutionForTolerance(tolerance))
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
      this._layer = PaintLayer.fromRecord(this._layer.resolution, cells)
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

  /** What to fill countries or islands with; the first of each type is kept. */
  useFiller(filler: Filler): void {
    if (!this.fillers.has(filler.type)) this.fillers.set(filler.type, filler)
  }

  /** Offer the Fill tool for countries or islands, once they are given; undefined takes it away. */
  offerFill(type: FillType | undefined): void {
    this.filler = type && this.fillers.get(type)
    this._fillType.value = this.filler?.type
  }

  /** What a fill at this point would fill, or a small one within `reach` of it. */
  targetAt(at: LatLon, reach: Km): FillTarget | undefined {
    return this.filler?.targetAt(at, reach)
  }

  isFilled(target: FillTarget): boolean {
    return this.fills.has(target.id)
  }

  /**
   * Fill what is at a point with an even coat (see fill.ts), or take the
   * fill off if it is already filled; one undoable step. Nothing at sea.
   */
  fillAt(at: LatLon, reach: Km): void {
    const target = this.targetAt(at, reach)
    if (target) this.fill(target)
  }

  /** As fillAt, from outside the map: a small country counts within `near`. */
  fillOutside(at: LatLon, near: Km): void {
    this.fillAt(at, near)
  }

  private fill(target: FillTarget): void {
    this.pushHistory()
    const filled = this.fills.get(target.id)
    if (filled) {
      this._layer.removeCoat(filled, FILL_DENSITY)
      this.fills.delete(target.id)
    } else {
      const cells = target.cells(this._layer.resolution)
      this._layer.addCoat(cells, FILL_DENSITY)
      this.fills.set(target.id, cells)
    }
    this.changed()
  }

  // ---- trims ----------------------------------------------------------------

  /**
   * Drop the paint out at sea (see land.ts) as one undoable step. Returns
   * the share of the paint's mass removed: 0 when there was none at sea.
   */
  trimSea(mask: LandMask): number {
    return this.keepOnly(trimSea(this._layer.cells, mask, this._layer.resolution))
  }

  /** Drop the paint on dry land, for a lake or sea, as trimSea drops it at sea. */
  trimLand(mask: WaterMask): number {
    return this.keepOnly(trimLand(this._layer.cells, mask, this._layer.resolution))
  }

  /** Drop the paint outside a hint's band, as trimSea drops it at sea. */
  trimToHint(band: HintBand): number {
    return this.keepOnly(trimToHint(this._layer.cells, band, this._layer.resolution))
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
  beginStroke(tool: StrokeTool): void {
    this.pushHistory()
    this.stroking.value = tool
  }

  /** Negative strength erases. */
  stamp(at: LatLon, radius: Km, strength: number): void {
    this._layer.stamp(at, radius, strength)
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

  private restoreSnapshot(snapshot: Snapshot): void {
    this._layer.replaceCells(snapshot.cells)
    this.fills = snapshot.fills
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
    const previous = this.undoStack.pop()
    if (!previous) return
    this.redoStack.push(this.snapshot())
    this.restoreSnapshot(previous)
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
