/**
 * Painting with the mouse, a finger or the keyboard on the MapLibre map:
 * strokes, the Fill tool's clicks, the brush footprint cursor, and the
 * shortcuts.
 */
import { Point, type LngLat, type MapMouseEvent, type MapTouchEvent } from "maplibre-gl"
import { signal } from "@preact/signals"
import type { LatLon } from "@whereabouts/shared/geo"
import type { GameMap } from "./map"
import type { PaintModel } from "./paint-model"
import type { PaintView } from "./paint-view"
import { forTabbedControl, isTyping } from "./keys"

export type Tool = "pan" | "paint" | "erase" | "fill"

export class PaintInput {
  readonly tool = signal<Tool>("paint")
  readonly brushPx = signal(40)
  readonly strength = signal(1)
  /** Whether painting is currently allowed (guessing phase, not locked). */
  readonly enabled = signal(false)

  private spaceHeld = false
  /** Where a middle-button drag last was, while one pans the map. */
  private middleFrom: { x: number; y: number } | undefined = undefined
  private painting = false
  private lastStampPoint: Point | undefined = undefined
  private hoverListeners = new Set<(pos: LatLon) => void>()
  /** Where the mouse is over the map, so the footprint can be redrawn without it moving. */
  private pointerAt: LngLat | undefined = undefined
  /** Whether the last pointer on the map can hover: a mouse or pen, not a finger. */
  private hovering = true
  private disposers: (() => void)[] = []
  private readonly gameMap: GameMap
  private readonly model: PaintModel
  private readonly view: PaintView

  constructor(gameMap: GameMap, model: PaintModel, view: PaintView) {
    this.gameMap = gameMap
    this.model = model
    this.view = view
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
      this.view.queue()
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
        this.view.queue()
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
      if (!this.canFill() || !gameMap.onSurface(e.point)) return
      this.model.fillAt(latLon(e.lngLat), this.kmPerPx(e.lngLat.lat))
      this.refreshCursor()
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
        if (e.shiftKey) this.model.redo()
        else this.model.undo()
        e.preventDefault()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        this.model.redo()
        e.preventDefault()
        return
      }
      if (e.key === "1") this.tool.value = "pan"
      if (e.key === "2") this.tool.value = "paint"
      if (e.key === "3") this.tool.value = "erase"
      if (e.key === "4" && this.model.fillable.value) this.tool.value = "fill"
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
      map.getContainer().dataset.panning = ""
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
      delete map.getContainer().dataset.panning
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
          this.view.cancel()
        }
        this.applyInteraction()
      })
    )
    // No Fill tool this round: back to the brush.
    this.disposers.push(
      this.model.fillable.subscribe((on) => {
        if (!on && this.tool.value === "fill") this.tool.value = "paint"
        this.refreshCursor()
      })
    )
  }

  dispose(): void {
    for (const d of this.disposers) d()
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
      this.model.fillable.value &&
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
    // For the cursor (MapView.module.css).
    const brush = this.tool.value === "paint" || this.tool.value === "erase"
    const tool = this.canFill() ? "fill" : canPaint && brush ? this.tool.value : undefined
    if (tool) el.dataset.tool = tool
    else delete el.dataset.tool
    this.refreshCursor()
  }

  private kmPerPx(lat: number): number {
    return this.gameMap.metersPerPixel(lat) / 1000
  }

  private brushRadiusKm(lat: number): number {
    return (this.brushPx.value * this.gameMap.metersPerPixel(lat)) / 1000
  }

  // ---- strokes: shared by mouse and touch -----------------------------------

  private beginStroke(point: Point): void {
    const tool = this.tool.value
    if (tool !== "paint" && tool !== "erase") return
    this.model.beginStroke(tool)
    this.painting = true
    this.lastStampPoint = undefined
    this.strokeTo(point)
    this.view.queue()
  }

  private endStroke(): void {
    this.painting = false
    this.lastStampPoint = undefined
    this.model.endStroke()
  }

  /** A stroke that turned out to be the start of a pinch: end it and take its paint back. */
  private abandonStroke(): void {
    if (!this.painting) return
    this.painting = false
    this.lastStampPoint = undefined
    this.model.abandonStroke()
  }

  /**
   * The cursor is the real footprint of the next stamp: the hex cells it
   * would touch, at the resolution the layer would pick. Nothing else.
   */
  private updateCursor(lngLat: LngLat): void {
    if (this.canFill()) {
      // The country a click would fill, or unfill (dotted).
      const f = this.model.countryAt(latLon(lngLat), this.kmPerPx(lngLat.lat))
      this.gameMap.setCursorShape(f && this.model.outline(f), f ? this.model.isFilled(f) : false)
      return
    }
    if (!this.canPaint()) {
      this.hideCursor()
      return
    }
    this.gameMap.setCursorFootprint(
      this.model.layer.stampCells(latLon(lngLat), this.brushRadiusKm(lngLat.lat)),
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
    this.model.stamp(latLon(lngLat), this.brushRadiusKm(lngLat.lat), sign * this.strength.value * 0.3)
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
}

function latLon(lngLat: LngLat): LatLon {
  return { lat: lngLat.lat, lon: lngLat.lng }
}
