/**
 * Painting with the mouse, a finger or the keyboard on the MapLibre map:
 * strokes, the Fill tool's clicks, the brush footprint cursor, and the
 * shortcuts.
 */
import { Point, type LngLat, type MapMouseEvent, type MapTouchEvent } from "maplibre-gl"
import { signal } from "@preact/signals"
import type { LatLon } from "@whereabouts/shared/geo"
import type { GameMap } from "../map/map"
import type { PaintModel } from "./paint-model"
import type { PaintView } from "./paint-view"
import { forTabbedControl, isTyping } from "../keyboard/keys"
import { PAN_HOLD, runPaintKey, type PaintKeyTarget } from "../keyboard/shortcuts"
import { strokePoints, touchMove, touchStart, TouchStep, type ScreenPoint } from "./stroke"
import { Tool, type StrokeTool } from "./tool"
import type { Degrees, Km, Px } from "@whereabouts/shared/units"

/** How near a point a small country's answer counts as under it, for the Fill tool. */
const FILL_SMALL: Px = 12

export class PaintInput {
  readonly tool = signal<Tool>(Tool.PAINT)
  readonly brushRadius = signal<Px>(40)
  readonly strength = signal(1)
  /** Whether painting is currently allowed (guessing phase, not locked). */
  readonly enabled = signal(false)

  private spaceHeld = false
  /** Where a middle-button drag last was, while one pans the map. */
  private middleFrom: ScreenPoint | undefined = undefined
  private stroke: { tool: StrokeTool; last: Point | undefined } | undefined = undefined
  private hoverListeners = new Set<(position: LatLon) => void>()
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
    const onDown = (event: MapMouseEvent) => {
      if (!this.canPaint() || event.originalEvent.button !== 0 || !gameMap.onSurface(event.point)) return
      this.beginStroke(event.point)
    }
    // Two fingers pan and zoom, which MapLibre handles itself once the
    // one-finger stroke is abandoned (stroke.ts).
    const onTouchStart = (event: MapTouchEvent) => {
      if (touchStart(event.points.length, this.canPaint()) === TouchStep.ABANDON) {
        this.abandonStroke()
        return
      }
      if (!gameMap.onSurface(event.point)) return
      event.preventDefault()
      this.beginStroke(event.point)
    }
    const onTouchMove = (event: MapTouchEvent) => {
      const step = touchMove(event.points.length, this.stroke !== undefined)
      if (step === TouchStep.ABANDON) this.abandonStroke()
      if (step !== TouchStep.CONTINUE) return
      event.preventDefault()
      this.strokeTo(event.point)
      this.view.queue()
    }
    const onTouchEnd = () => this.endStroke()
    const onMove = (event: MapMouseEvent) => {
      const onEarth = gameMap.onSurface(event.point)
      // A tap also sends a mouse move, which shouldn't leave a footprint behind.
      if (this.hovering) {
        this.pointerAt = onEarth ? event.lngLat : undefined
        this.refreshCursor()
      }
      if (this.stroke) {
        this.strokeTo(event.point)
        this.view.queue()
      }
      if (onEarth)
        for (const listener of this.hoverListeners) listener({ lat: event.lngLat.lat, lon: event.lngLat.lng })
    }
    const onOut = () => {
      this.pointerAt = undefined
      this.hideCursor()
    }
    // A zoom under a still pointer (the scroll wheel) changes the footprint too.
    const onZoom = () => this.refreshCursor()
    const onUp = () => this.endStroke()
    // The Fill tool acts on a click (a tap, on a phone), so the map still drags.
    const onClick = (event: MapMouseEvent) => {
      if (!this.canFill() || !gameMap.onSurface(event.point)) return
      this.model.fillAt(latLon(event.lngLat), this.fillReach(event.lngLat.lat))
      this.refreshCursor()
    }
    const keyTarget: PaintKeyTarget = {
      enabled: () => this.enabled.value,
      setTool: (tool) => (this.tool.value = tool),
      canFill: () => this.model.fillable.value,
      resizeBrush: (factor) => this.setBrushSize(this.brushRadius.value * factor),
      undo: () => this.model.undo(),
      redo: () => this.model.redo()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target ?? undefined)) return
      if (PAN_HOLD.matches(event)) {
        if (forTabbedControl(event) || this.spaceHeld) return
        this.spaceHeld = true
        this.endStroke()
        this.applyInteraction()
        event.preventDefault()
        return
      }
      if (runPaintKey(event, keyTarget)) event.preventDefault()
    }
    // A middle-button drag pans whatever the tool, like holding Space.
    // MapLibre's own drag pan only listens to the left button.
    const onMiddleDown = (event: MouseEvent) => {
      if (event.button !== 1) return
      event.preventDefault() // no autoscroll
      this.endStroke()
      this.middleFrom = { x: event.clientX, y: event.clientY }
      map.getContainer().dataset["panning"] = ""
      this.applyInteraction()
    }
    const onMiddleMove = (event: MouseEvent) => {
      if (!this.middleFrom) return
      map.panBy([this.middleFrom.x - event.clientX, this.middleFrom.y - event.clientY], { duration: 0 })
      this.middleFrom = { x: event.clientX, y: event.clientY }
    }
    const onMiddleUp = (event: MouseEvent) => {
      if (event.button !== 1 || !this.middleFrom) return
      this.middleFrom = undefined
      delete map.getContainer().dataset["panning"]
      this.applyInteraction()
    }
    const canvas = map.getCanvasContainer()
    const onKeyUp = (event: KeyboardEvent) => {
      if (PAN_HOLD.matches(event)) {
        this.spaceHeld = false
        this.applyInteraction()
      }
    }
    const onPointer = (event: PointerEvent) => {
      this.hovering = event.pointerType !== "touch"
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
    this.disposers.push(
      this.tool.subscribe(() => {
        if (this.stroke) this.endStroke()
        this.applyInteraction()
      })
    )
    // [ and ] or the slider resize the brush while the mouse stays put.
    this.disposers.push(this.brushRadius.subscribe(() => this.refreshCursor()))
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
        if (!on && this.tool.value === Tool.FILL) this.tool.value = Tool.PAINT
        this.refreshCursor()
      })
    )
  }

  dispose(): void {
    for (const dispose of this.disposers) dispose()
  }

  onHover(listener: (position: LatLon) => void): () => void {
    this.hoverListeners.add(listener)
    return () => this.hoverListeners.delete(listener)
  }

  setBrushSize(size: Px): void {
    this.brushRadius.value = Math.min(200, Math.max(6, Math.round(size)))
  }

  private canPaint(): boolean {
    return (
      this.enabled.value &&
      this.tool.value !== Tool.PAN &&
      this.tool.value !== Tool.FILL &&
      !this.spaceHeld &&
      !this.middleFrom
    )
  }

  private canFill(): boolean {
    return (
      this.enabled.value &&
      this.tool.value === Tool.FILL &&
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
    const container = map.getContainer()
    // For the cursor (MapView.module.css).
    const brush = this.tool.value === Tool.PAINT || this.tool.value === Tool.ERASE
    const tool = this.canFill() ? Tool.FILL : canPaint && brush ? this.tool.value : undefined
    if (tool) container.dataset["tool"] = tool
    else delete container.dataset["tool"]
    this.refreshCursor()
  }

  private fillReach(lat: Degrees): Km {
    return this.gameMap.pixelsToKm(FILL_SMALL, lat)
  }

  private groundBrushRadius(lat: Degrees): Km {
    return this.gameMap.pixelsToKm(this.brushRadius.value, lat)
  }

  // ---- strokes: shared by mouse and touch -----------------------------------

  private beginStroke(point: Point): void {
    const tool = this.tool.value
    if (tool !== Tool.PAINT && tool !== Tool.ERASE) return
    this.model.beginStroke(tool)
    this.stroke = { tool, last: undefined }
    this.strokeTo(point)
    this.view.queue()
  }

  private endStroke(): void {
    this.stroke = undefined
    this.model.endStroke()
  }

  /** A stroke that turned out to be the start of a pinch: end it and take its paint back. */
  private abandonStroke(): void {
    if (!this.stroke) return
    this.stroke = undefined
    this.model.abandonStroke()
  }

  /**
   * The cursor is the real footprint of the next stamp: the hex cells it
   * would touch, at the resolution the layer would pick. Nothing else.
   */
  private updateCursor(lngLat: LngLat): void {
    if (this.canFill()) {
      // The country a click would fill, or unfill (dotted).
      const question = this.model.countryAt(latLon(lngLat), this.fillReach(lngLat.lat))
      this.gameMap.setCursorShape(
        question && this.model.outline(question),
        question ? this.model.isFilled(question) : false
      )
      return
    }
    if (!this.canPaint()) {
      this.hideCursor()
      return
    }
    this.gameMap.setCursorFootprint(
      this.model.layer.stampCells(latLon(lngLat), this.groundBrushRadius(lngLat.lat)),
      this.tool.value === Tool.ERASE
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

  private stampAt(lngLat: LngLat, tool: StrokeTool): void {
    const sign = tool === Tool.ERASE ? -1 : 1
    // Stamps overlap along a stroke, so scale each one down.
    this.model.stamp(latLon(lngLat), this.groundBrushRadius(lngLat.lat), sign * this.strength.value * 0.3)
  }

  private strokeTo(point: Point): void {
    const stroke = this.stroke
    if (!stroke) return
    for (const { x, y } of strokePoints(stroke.last, point, this.brushRadius.value)) {
      const stamp = new Point(x, y)
      this.stampOnSurface(stamp, stroke.tool)
      stroke.last = stamp
    }
  }

  /** A stroke carries on across the space around a globe, painting only where it crosses the Earth. */
  private stampOnSurface(point: Point, tool: StrokeTool): void {
    if (this.gameMap.onSurface(point)) this.stampAt(this.gameMap.map.unproject(point), tool)
  }
}

function latLon(lngLat: LngLat): LatLon {
  return { lat: lngLat.lat, lon: lngLat.lng }
}
