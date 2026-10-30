/**
 * Imperative glue between the MapLibre map and a PaintLayer: brush input,
 * the brush footprint cursor, keyboard shortcuts, and rendering. Screens configure it and
 * read its signals; it never knows about game phases.
 */
import { Point, type LngLat, type MapMouseEvent, type MapTouchEvent } from "maplibre-gl"
import { batch, computed, signal, type ReadonlySignal } from "@preact/signals"
import { FILL_DENSITY } from "@whereabouts/shared/fill"
import { PaintLayer, resolutionForTolerance } from "@whereabouts/shared/paint"
import { paintAmount, trimLand, trimSea, type LandMask, type WaterMask } from "@whereabouts/shared/land"
import { trimToHint, type HintBand } from "@whereabouts/shared/hints"
import { h3Res, type H3Cell } from "@whereabouts/shared/h3"
import type { FlagCode } from "@whereabouts/shared/ids"
import type { FlagQuestion } from "@whereabouts/shared/flags"
import type { LatLon } from "@whereabouts/shared/geo"
import type { GameMap } from "./map"
import type { CountryFiller } from "./fill"
import { forTabbedControl, isTyping } from "./keys"

export type Tool = "pan" | "paint" | "erase" | "fill"

/** How near the pointer a small country's answer counts as under it, for the Fill tool. */
const FILL_SMALL_PX = 12
/** How long a change waits for an animation frame before `version` moves without one. */
const VERSION_WAIT_MS = 100

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

export class PaintController {
  readonly tool = signal<Tool>("paint")
  readonly brushPx = signal(40)
  readonly strength = signal(1)
  readonly floor = signal(0.05)
  /** Increments whenever the paint changes; cheap dependency for panels. */
  readonly version = signal(0)
  /**
   * Follows `version` about 200 ms after the last change. Panels that do
   * heavier work per update (blob detection, live scoring) depend on this so
   * they do not run on every animation frame mid-stroke.
   */
  readonly settledVersion = signal(0)
  private settleTimer: number | undefined = undefined
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
  /** The tool of the stroke being held (never pan, nor a pinch), or undefined; drives the spray and eraser sounds. */
  readonly stroking = signal<"paint" | "erase" | undefined>(undefined)
  /** Whether painting is currently allowed (guessing phase, not locked). */
  readonly enabled = signal(false)
  /** The current question's tolerance, set by the active screen (used by dev tooling). */
  readonly toleranceKm = signal(100)
  /**
   * Whether the Fill tool is offered: a round asking for a country, on the
   * Political map. Set by the screen; the countries come in `filler`.
   */
  readonly fillable = signal(false)
  filler: CountryFiller | undefined = undefined
  /** The countries filled, by flag code, with the cells each was filled with. */
  private fills = new Map<FlagCode, H3Cell[]>()

  layer = new PaintLayer(h3Res(4))
  private spaceHeld = false
  /** Where a middle-button drag last was, while one pans the map. */
  private middleFrom: { x: number; y: number } | undefined = undefined
  private painting = false
  private lastStampPoint: Point | undefined = undefined
  /** The frame that will draw our paint, while one is queued. */
  private renderFrame: number | undefined = undefined
  private versionTimer: number | undefined = undefined
  private hoverListeners = new Set<(pos: LatLon) => void>()
  /** Where the mouse is over the map, so the footprint can be redrawn without it moving. */
  private pointerAt: LngLat | undefined = undefined
  /** Whether the last pointer on the map can hover: a mouse or pen, not a finger. */
  private hovering = true
  private disposers: (() => void)[] = []
  readonly gameMap: GameMap

  constructor(gameMap: GameMap) {
    this.gameMap = gameMap
    const map = gameMap.map
    const onDown = (e: MapMouseEvent) => {
      if (!this.canPaint() || e.originalEvent.button !== 0 || !gameMap.onSurface(e.point)) return
      this.beginStroke(e.point)
    }
    // Touch: one finger uses the current tool, so it paints when painting is
    // on; two fingers always pan and zoom, which MapLibre handles itself once
    // the one-finger stroke is abandoned (and undone, since a pinch starts
    // with a single touch for a moment).
    const onTouchStart = (e: MapTouchEvent) => {
      if (e.points.length !== 1 || !this.canPaint()) {
        this.abandonStroke()
        return
      }
      if (!gameMap.onSurface(e.point)) return
      e.preventDefault()
      this.beginStroke(e.point)
    }
    const onTouchMove = (e: MapTouchEvent) => {
      if (!this.painting) return
      if (e.points.length !== 1) {
        this.abandonStroke()
        return
      }
      e.preventDefault()
      this.strokeTo(e.point)
      this.queueRender()
    }
    const onTouchEnd = () => this.endStroke()
    const onMove = (e: MapMouseEvent) => {
      const onEarth = gameMap.onSurface(e.point)
      // A tap also sends a mouse move, which shouldn't leave a footprint behind.
      if (this.hovering) {
        this.pointerAt = onEarth ? e.lngLat : undefined
        this.refreshCursor()
      }
      if (this.painting) {
        this.strokeTo(e.point)
        this.queueRender()
      }
      if (onEarth) for (const l of this.hoverListeners) l({ lat: e.lngLat.lat, lon: e.lngLat.lng })
    }
    const onOut = () => {
      this.pointerAt = undefined
      this.hideCursor()
    }
    // A zoom under a still pointer (the scroll wheel) changes the footprint too.
    const onZoom = () => this.refreshCursor()
    const onUp = () => this.endStroke()
    // The Fill tool acts on a click (a tap, on a phone), so the map still drags.
    const onClick = (e: MapMouseEvent) => {
      if (this.canFill() && gameMap.onSurface(e.point)) this.fillAt(e.lngLat)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target ?? undefined)) return
      if (e.code === "Space" && forTabbedControl(e)) return
      if (e.code === "Space" && !this.spaceHeld) {
        this.spaceHeld = true
        this.endStroke()
        this.applyInteraction()
        e.preventDefault()
        return
      }
      if (!this.enabled.value) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) this.redo()
        else this.undo()
        e.preventDefault()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        this.redo()
        e.preventDefault()
        return
      }
      if (e.key === "1") this.tool.value = "pan"
      if (e.key === "2") this.tool.value = "paint"
      if (e.key === "3") this.tool.value = "erase"
      if (e.key === "4" && this.fillable.value) this.tool.value = "fill"
      if (e.key === "[") this.setBrushPx(this.brushPx.value / 1.25)
      if (e.key === "]") this.setBrushPx(this.brushPx.value * 1.25)
    }
    // A middle-button drag pans whatever the tool, like holding Space.
    // MapLibre's own drag pan only listens to the left button.
    const onMiddleDown = (e: MouseEvent) => {
      if (e.button !== 1) return
      e.preventDefault() // no autoscroll
      this.endStroke()
      this.middleFrom = { x: e.clientX, y: e.clientY }
      map.getContainer().classList.add("panning")
      this.applyInteraction()
    }
    const onMiddleMove = (e: MouseEvent) => {
      if (!this.middleFrom) return
      map.panBy([this.middleFrom.x - e.clientX, this.middleFrom.y - e.clientY], { duration: 0 })
      this.middleFrom = { x: e.clientX, y: e.clientY }
    }
    const onMiddleUp = (e: MouseEvent) => {
      if (e.button !== 1 || !this.middleFrom) return
      this.middleFrom = undefined
      map.getContainer().classList.remove("panning")
      this.applyInteraction()
    }
    const canvas = map.getCanvasContainer()
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        this.spaceHeld = false
        this.applyInteraction()
      }
    }
    const onPointer = (e: PointerEvent) => {
      this.hovering = e.pointerType !== "touch"
      if (!this.hovering && this.pointerAt) {
        this.pointerAt = undefined
        this.hideCursor()
      }
    }
    map.on("mousedown", onDown)
    map.on("click", onClick)
    map.on("mousemove", onMove)
    map.on("mouseout", onOut)
    map.on("zoom", onZoom)
    map.on("touchstart", onTouchStart)
    map.on("touchmove", onTouchMove)
    map.on("touchend", onTouchEnd)
    map.on("touchcancel", onTouchEnd)
    window.addEventListener("mouseup", onUp)
    canvas.addEventListener("pointerdown", onPointer)
    canvas.addEventListener("pointermove", onPointer)
    canvas.addEventListener("mousedown", onMiddleDown)
    window.addEventListener("mousemove", onMiddleMove)
    window.addEventListener("mouseup", onMiddleUp)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    this.disposers.push(() => {
      map.off("mousedown", onDown)
      map.off("click", onClick)
      map.off("mousemove", onMove)
      map.off("mouseout", onOut)
      map.off("zoom", onZoom)
      map.off("touchstart", onTouchStart)
      map.off("touchmove", onTouchMove)
      map.off("touchend", onTouchEnd)
      map.off("touchcancel", onTouchEnd)
      window.removeEventListener("mouseup", onUp)
      canvas.removeEventListener("pointerdown", onPointer)
      canvas.removeEventListener("pointermove", onPointer)
      canvas.removeEventListener("mousedown", onMiddleDown)
      window.removeEventListener("mousemove", onMiddleMove)
      window.removeEventListener("mouseup", onMiddleUp)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    })
    this.disposers.push(this.tool.subscribe(() => this.applyInteraction()))
    // [ and ] or the slider resize the brush while the mouse stays put.
    this.disposers.push(this.brushPx.subscribe(() => this.refreshCursor()))
    this.disposers.push(
      this.enabled.subscribe((on) => {
        // Painting can be switched off mid-stroke, when the round ends. Stop
        // there, and keep a queued draw of our paint off whatever is shown next.
        if (!on) {
          this.endStroke()
          this.cancelRender()
        }
        this.applyInteraction()
      })
    )
    // No Fill tool this round: back to the brush.
    this.disposers.push(
      this.fillable.subscribe((on) => {
        if (!on && this.tool.value === "fill") this.tool.value = "paint"
        this.refreshCursor()
      })
    )
    this.disposers.push(
      this.version.subscribe((v) => {
        if (this.settleTimer !== undefined) window.clearTimeout(this.settleTimer)
        this.settleTimer = window.setTimeout(() => {
          this.settleTimer = undefined
          this.settledVersion.value = v
        }, 200)
      })
    )
  }

  dispose(): void {
    if (this.settleTimer !== undefined) window.clearTimeout(this.settleTimer)
    window.clearTimeout(this.versionTimer)
    for (const d of this.disposers) d()
  }

  /** Start a fresh layer sized for a question's tolerance. */
  reset(toleranceKm: number): void {
    batch(() => {
      this.toleranceKm.value = toleranceKm
      this.layer = new PaintLayer(resolutionForTolerance(toleranceKm))
      this.fills = new Map()
      this.version.value++
      this.undoStack = []
      this.redoStack = []
      this.syncHistoryFlags()
    })
    this.gameMap.setPaint(this.layer.toGeoJSON())
  }

  clear(): void {
    if (this.layer.isEmpty) return
    this.pushHistory()
    this.layer.clear()
    this.fills = new Map()
    this.queueRender()
  }

  /**
   * Fill the country at a point with an even coat (see fill.ts), or take the
   * fill off if it is already filled; one undoable step. Nothing at sea.
   */
  fillAt(lngLat: LngLat): void {
    const f = this.countryAt(lngLat)
    if (f) this.fill(f)
    this.refreshCursor()
  }

  /** As fillAt, from outside the map: a small country counts within `nearKm`. */
  fillOutside(at: LatLon, nearKm: number): void {
    const f = this.filler?.countryAt(at, nearKm / FILL_SMALL_PX, FILL_SMALL_PX)
    if (f) this.fill(f)
  }

  private fill(f: FlagQuestion): void {
    this.pushHistory()
    const filled = this.fills.get(f.flag)
    if (filled) {
      this.layer.removeCoat(filled, FILL_DENSITY)
      this.fills.delete(f.flag)
    } else {
      const cells = this.filler!.cells(f, this.layer.res)
      this.layer.addCoat(cells, FILL_DENSITY)
      this.fills.set(f.flag, cells)
    }
    this.queueRender()
  }

  private countryAt(lngLat: LngLat) {
    if (!this.filler) return undefined
    const p = { lat: lngLat.lat, lon: lngLat.lng }
    return this.filler.countryAt(p, this.gameMap.metersPerPixel(p.lat) / 1000, FILL_SMALL_PX)
  }

  /**
   * Drop the paint out at sea (see land.ts) as one undoable step. Returns
   * the share of the paint's mass removed: 0 when there was none at sea.
   */
  trimSea(mask: LandMask): number {
    return this.keepOnly(trimSea(this.layer.cells, mask, this.layer.res))
  }

  /** Drop the paint on dry land, for a lake or sea, as trimSea drops it at sea. */
  trimLand(mask: WaterMask): number {
    return this.keepOnly(trimLand(this.layer.cells, mask, this.layer.res))
  }

  /** Drop the paint outside a hint's band, as trimSea drops it at sea. */
  trimToHint(band: HintBand): number {
    return this.keepOnly(trimToHint(this.layer.cells, band, this.layer.res))
  }

  private keepOnly(kept: Map<H3Cell, number>): number {
    const share = 1 - paintAmount(kept) / paintAmount(this.layer.cells)
    if (!(share > 1e-9)) return 0
    this.pushHistory()
    this.layer.replaceCells(kept)
    this.queueRender()
    return share
  }

  // ---- strokes from outside the map: the VR spray can -----------------------

  /** One undo step for every stamp until `endOutsideStroke`. */
  beginOutsideStroke(tool: "paint" | "erase"): void {
    this.pushHistory()
    this.stroking.value = tool
  }

  /** Negative strength erases. */
  stampOutside(at: LatLon, radiusKm: number, strength: number): void {
    this.layer.stamp(at, radiusKm, strength)
    this.queueRender()
  }

  endOutsideStroke(): void {
    this.stroking.value = undefined
  }

  // ---- undo / redo: one entry per stroke, clear or trim ---------------------

  private static readonly HISTORY_LIMIT = 50
  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []
  readonly canUndo = signal(false)
  readonly canRedo = signal(false)

  private snapshot(): Snapshot {
    return { cells: new Map(this.layer.cells), fills: new Map(this.fills) }
  }

  private restore(s: Snapshot): void {
    this.layer.replaceCells(s.cells)
    this.fills = s.fills
  }

  private pushHistory(): void {
    this.undoStack.push(this.snapshot())
    if (this.undoStack.length > PaintController.HISTORY_LIMIT) this.undoStack.shift()
    this.redoStack = []
    this.syncHistoryFlags()
  }

  undo(): void {
    const prev = this.undoStack.pop()
    if (!prev) return
    this.redoStack.push(this.snapshot())
    this.restore(prev)
    this.syncHistoryFlags()
    this.queueRender()
  }

  redo(): void {
    const next = this.redoStack.pop()
    if (!next) return
    this.undoStack.push(this.snapshot())
    this.restore(next)
    this.syncHistoryFlags()
    this.queueRender()
  }

  private syncHistoryFlags(): void {
    this.canUndo.value = this.undoStack.length > 0
    this.canRedo.value = this.redoStack.length > 0
  }

  /** Show a foreign layer (another player's paint) without touching ours. */
  showLayer(layer: PaintLayer | undefined, colour: string | undefined): void {
    this.gameMap.setPaintColour(colour)
    this.gameMap.setPaint(layer ? layer.toGeoJSON() : { type: "FeatureCollection", features: [] })
  }

  /**
   * Show several players' paint at once, each in its own colour. Earlier
   * entries draw underneath later ones. Returns the combined GeoJSON so the
   * caller can frame it.
   */
  showLayers(entries: { layer: PaintLayer; colour: string }[]): GeoJSON.FeatureCollection {
    const features: GeoJSON.Feature[] = []
    for (const { layer, colour } of entries) {
      for (const f of layer.toGeoJSON().features) {
        features.push({ ...f, properties: { ...f.properties, colour } })
      }
    }
    const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features }
    this.gameMap.setPaintColourPerFeature()
    this.gameMap.setPaint(fc)
    return fc
  }

  /** Put our own paint back on the map, in a player colour or the theme ramp. */
  showOwn(colour?: string): void {
    this.gameMap.setPaintColour(colour)
    this.gameMap.setPaint(this.layer.toGeoJSON())
  }

  onHover(listener: (pos: LatLon) => void): () => void {
    this.hoverListeners.add(listener)
    return () => this.hoverListeners.delete(listener)
  }

  setBrushPx(px: number): void {
    this.brushPx.value = Math.min(200, Math.max(6, Math.round(px)))
  }

  private canPaint(): boolean {
    return (
      this.enabled.value &&
      this.tool.value !== "pan" &&
      this.tool.value !== "fill" &&
      !this.spaceHeld &&
      !this.middleFrom
    )
  }

  private canFill(): boolean {
    return (
      this.enabled.value &&
      this.tool.value === "fill" &&
      this.fillable.value &&
      this.filler !== undefined &&
      !this.spaceHeld &&
      !this.middleFrom
    )
  }

  private applyInteraction(): void {
    const map = this.gameMap.map
    const canPaint = this.canPaint()
    if (canPaint) map.dragPan.disable()
    else map.dragPan.enable()
    const el = map.getContainer()
    el.classList.toggle("tool-paint", canPaint && this.tool.value === "paint")
    el.classList.toggle("tool-erase", canPaint && this.tool.value === "erase")
    el.classList.toggle("tool-fill", this.canFill())
    this.refreshCursor()
  }

  private brushRadiusKm(lat: number): number {
    return (this.brushPx.value * this.gameMap.metersPerPixel(lat)) / 1000
  }

  // ---- strokes: shared by mouse and touch -----------------------------------

  private beginStroke(point: Point): void {
    this.pushHistory()
    this.painting = true
    const tool = this.tool.value
    this.stroking.value = tool === "paint" || tool === "erase" ? tool : undefined
    this.lastStampPoint = undefined
    this.strokeTo(point)
    this.queueRender()
  }

  private endStroke(): void {
    this.painting = false
    this.stroking.value = undefined
    this.lastStampPoint = undefined
  }

  /** A stroke that turned out to be the start of a pinch: end it and take its paint back. */
  private abandonStroke(): void {
    if (!this.painting) return
    this.endStroke()
    this.undo()
    this.redoStack.pop()
    this.syncHistoryFlags()
  }

  /**
   * The cursor is the real footprint of the next stamp: the hex cells it
   * would touch, at the resolution the layer would pick. Nothing else.
   */
  private updateCursor(lngLat: LngLat): void {
    if (this.canFill()) {
      // The country a click would fill, or unfill (dotted).
      const f = this.countryAt(lngLat)
      this.gameMap.setCursorShape(f ? this.filler!.outline(f) : undefined, f ? this.fills.has(f.flag) : false)
      return
    }
    if (!this.canPaint()) {
      this.hideCursor()
      return
    }
    const at = { lat: lngLat.lat, lon: lngLat.lng }
    this.gameMap.setCursorFootprint(
      this.layer.stampCells(at, this.brushRadiusKm(lngLat.lat)),
      this.tool.value === "erase"
    )
  }

  /** Redraw the footprint where the mouse already is, after the brush, tool or zoom changed. */
  private refreshCursor(): void {
    if (this.pointerAt) this.updateCursor(this.pointerAt)
    else this.hideCursor()
  }

  private hideCursor(): void {
    this.gameMap.setCursorFootprint(undefined)
  }

  private stampAt(lngLat: LngLat): void {
    const sign = this.tool.value === "erase" ? -1 : 1
    // Stamps overlap along a stroke, so scale each one down.
    this.layer.stamp(
      { lat: lngLat.lat, lon: lngLat.lng },
      this.brushRadiusKm(lngLat.lat),
      sign * this.strength.value * 0.3
    )
  }

  private strokeTo(point: Point): void {
    if (!this.lastStampPoint) {
      this.stampOnSurface(point)
      this.lastStampPoint = point
      return
    }
    const start = this.lastStampPoint
    const dx = point.x - start.x
    const dy = point.y - start.y
    const dist = Math.hypot(dx, dy)
    const step = Math.max(2, this.brushPx.value / 4)
    if (dist < step) return
    const n = Math.floor(dist / step)
    for (let i = 1; i <= n; i++) {
      const t = (i * step) / dist
      const p = new Point(start.x + dx * t, start.y + dy * t)
      this.stampOnSurface(p)
      this.lastStampPoint = p
    }
  }

  /** A stroke carries on across the space around a globe, painting only where it crosses the Earth. */
  private stampOnSurface(point: Point): void {
    if (this.gameMap.onSurface(point)) this.stampAt(this.gameMap.map.unproject(point))
  }

  private queueRender(): void {
    // A VR headset runs no window animation frames while it shows its session,
    // and what follows `version` (uploads, Undo, Pass) must still hear of the
    // change. The map draws once frames come back.
    this.versionTimer ??= window.setTimeout(() => {
      this.versionTimer = undefined
      this.version.value++
    }, VERSION_WAIT_MS)
    if (this.renderFrame !== undefined) return
    this.renderFrame = requestAnimationFrame(() => {
      this.renderFrame = undefined
      window.clearTimeout(this.versionTimer)
      this.versionTimer = undefined
      this.gameMap.setPaint(this.layer.toGeoJSON())
      this.version.value++
    })
  }

  /** Drop a queued draw, still counting the change it was for. */
  private cancelRender(): void {
    if (this.renderFrame === undefined) return
    cancelAnimationFrame(this.renderFrame)
    this.renderFrame = undefined
    window.clearTimeout(this.versionTimer)
    this.versionTimer = undefined
    this.version.value++
  }
}
