/**
 * Imperative glue between the MapLibre map and a PaintLayer: brush input,
 * the brush footprint cursor, keyboard shortcuts, and rendering. Screens configure it and
 * read its signals; it never knows about game phases.
 */
import { Point, type LngLat, type MapMouseEvent, type MapTouchEvent } from "maplibre-gl";
import { batch, signal } from "@preact/signals";
import { PaintLayer, resolutionForTolerance, type LatLon } from "@whereabouts/shared";
import type { GameMap } from "./map";

export type Tool = "pan" | "paint" | "erase";

export class PaintController {
  readonly tool = signal<Tool>("paint");
  readonly brushPx = signal(40);
  readonly strength = signal(1);
  readonly floor = signal(0.05);
  /** Increments whenever the paint changes; cheap dependency for panels. */
  readonly version = signal(0);
  /**
   * Follows `version` about 200 ms after the last change. Panels that do
   * heavier work per update (blob detection, live scoring) depend on this so
   * they do not run on every animation frame mid-stroke.
   */
  readonly settledVersion = signal(0);
  private settleTimer: number | null = null;
  /** Whether painting is currently allowed (guessing phase, not locked). */
  readonly enabled = signal(false);
  /** The current question's tolerance, set by the active screen (used by dev tooling). */
  readonly toleranceKm = signal(100);

  layer = new PaintLayer(4);
  private spaceHeld = false;
  private painting = false;
  private lastStampPoint: Point | null = null;
  private renderQueued = false;
  private hoverListeners = new Set<(pos: LatLon) => void>();
  private disposers: (() => void)[] = [];
  readonly gameMap: GameMap;

  constructor(gameMap: GameMap) {
    this.gameMap = gameMap;
    const map = gameMap.map;
    const onDown = (e: MapMouseEvent) => {
      if (!this.canPaint() || e.originalEvent.button !== 0) return;
      this.beginStroke(e.point);
    };
    // Touch: one finger uses the current tool, so it paints when painting is
    // on; two fingers always pan and zoom, which MapLibre handles itself once
    // the one-finger stroke is abandoned (and undone, since a pinch starts
    // with a single touch for a moment).
    const onTouchStart = (e: MapTouchEvent) => {
      if (e.points.length !== 1 || !this.canPaint()) {
        this.abandonStroke();
        return;
      }
      e.preventDefault();
      this.beginStroke(e.point);
    };
    const onTouchMove = (e: MapTouchEvent) => {
      if (!this.painting) return;
      if (e.points.length !== 1) {
        this.abandonStroke();
        return;
      }
      e.preventDefault();
      this.strokeTo(e.point);
      this.queueRender();
    };
    const onTouchEnd = () => this.endStroke();
    const onMove = (e: MapMouseEvent) => {
      this.updateCursor(e.lngLat);
      if (this.painting) {
        this.strokeTo(e.point);
        this.queueRender();
      }
      for (const l of this.hoverListeners) l({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    };
    const onOut = () => {
      this.hideCursor();
    };
    const onUp = () => this.endStroke();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === "Space" && !this.spaceHeld) {
        this.spaceHeld = true;
        this.endStroke();
        this.applyInteraction();
        e.preventDefault();
        return;
      }
      if (!this.enabled.value) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) this.redo();
        else this.undo();
        e.preventDefault();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        this.redo();
        e.preventDefault();
        return;
      }
      if (e.key === "1") this.tool.value = "pan";
      if (e.key === "2") this.tool.value = "paint";
      if (e.key === "3") this.tool.value = "erase";
      if (e.key === "[") this.setBrushPx(this.brushPx.value / 1.25);
      if (e.key === "]") this.setBrushPx(this.brushPx.value * 1.25);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        this.spaceHeld = false;
        this.applyInteraction();
      }
    };
    map.on("mousedown", onDown);
    map.on("mousemove", onMove);
    map.on("mouseout", onOut);
    map.on("touchstart", onTouchStart);
    map.on("touchmove", onTouchMove);
    map.on("touchend", onTouchEnd);
    map.on("touchcancel", onTouchEnd);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    this.disposers.push(() => {
      map.off("mousedown", onDown);
      map.off("mousemove", onMove);
      map.off("mouseout", onOut);
      map.off("touchstart", onTouchStart);
      map.off("touchmove", onTouchMove);
      map.off("touchend", onTouchEnd);
      map.off("touchcancel", onTouchEnd);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    });
    this.disposers.push(this.tool.subscribe(() => this.applyInteraction()));
    this.disposers.push(this.enabled.subscribe(() => this.applyInteraction()));
    this.disposers.push(
      this.version.subscribe((v) => {
        if (this.settleTimer !== null) window.clearTimeout(this.settleTimer);
        this.settleTimer = window.setTimeout(() => {
          this.settleTimer = null;
          this.settledVersion.value = v;
        }, 200);
      }),
    );
  }

  dispose(): void {
    if (this.settleTimer !== null) window.clearTimeout(this.settleTimer);
    for (const d of this.disposers) d();
  }

  /** Start a fresh layer sized for a question's tolerance. */
  reset(toleranceKm: number): void {
    batch(() => {
      this.toleranceKm.value = toleranceKm;
      this.layer = new PaintLayer(resolutionForTolerance(toleranceKm));
      this.version.value++;
      this.undoStack = [];
      this.redoStack = [];
      this.syncHistoryFlags();
    });
    this.gameMap.setPaint(this.layer.toGeoJSON());
  }

  clear(): void {
    if (this.layer.isEmpty) return;
    this.pushHistory();
    this.layer.clear();
    this.queueRender();
  }

  // ---- undo / redo: one entry per stroke or clear ---------------------------

  private static readonly HISTORY_LIMIT = 50;
  private undoStack: Map<string, number>[] = [];
  private redoStack: Map<string, number>[] = [];
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);

  private pushHistory(): void {
    this.undoStack.push(new Map(this.layer.cells));
    if (this.undoStack.length > PaintController.HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.syncHistoryFlags();
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(new Map(this.layer.cells));
    this.layer.replaceCells(prev);
    this.syncHistoryFlags();
    this.queueRender();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(new Map(this.layer.cells));
    this.layer.replaceCells(next);
    this.syncHistoryFlags();
    this.queueRender();
  }

  private syncHistoryFlags(): void {
    this.canUndo.value = this.undoStack.length > 0;
    this.canRedo.value = this.redoStack.length > 0;
  }

  /** Show a foreign layer (another player's paint) without touching ours. */
  showLayer(layer: PaintLayer | null, colour: string | null): void {
    this.gameMap.setPaintColour(colour);
    this.gameMap.setPaint(layer ? layer.toGeoJSON() : { type: "FeatureCollection", features: [] });
  }

  /**
   * Show several players' paint at once, each in its own colour. Earlier
   * entries draw underneath later ones. Returns the combined GeoJSON so the
   * caller can frame it.
   */
  showLayers(entries: { layer: PaintLayer; colour: string }[]): GeoJSON.FeatureCollection {
    const features: GeoJSON.Feature[] = [];
    for (const { layer, colour } of entries) {
      for (const f of layer.toGeoJSON().features) {
        features.push({ ...f, properties: { ...f.properties, colour } });
      }
    }
    const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
    this.gameMap.setPaintColourPerFeature();
    this.gameMap.setPaint(fc);
    return fc;
  }

  /** Put our own paint back on the map, in a player colour or the theme ramp. */
  showOwn(colour: string | null = null): void {
    this.gameMap.setPaintColour(colour);
    this.gameMap.setPaint(this.layer.toGeoJSON());
  }

  onHover(listener: (pos: LatLon) => void): () => void {
    this.hoverListeners.add(listener);
    return () => this.hoverListeners.delete(listener);
  }

  setBrushPx(px: number): void {
    this.brushPx.value = Math.min(200, Math.max(6, Math.round(px)));
  }

  private canPaint(): boolean {
    return this.enabled.value && this.tool.value !== "pan" && !this.spaceHeld;
  }

  private applyInteraction(): void {
    const map = this.gameMap.map;
    const canPaint = this.canPaint();
    if (canPaint) map.dragPan.disable();
    else map.dragPan.enable();
    const el = map.getContainer();
    el.classList.toggle("tool-paint", canPaint && this.tool.value === "paint");
    el.classList.toggle("tool-erase", canPaint && this.tool.value === "erase");
    if (!canPaint) this.hideCursor();
  }

  private brushRadiusKm(lat: number): number {
    return (this.brushPx.value * this.gameMap.metersPerPixel(lat)) / 1000;
  }

  // ---- strokes: shared by mouse and touch -----------------------------------

  private beginStroke(point: Point): void {
    this.pushHistory();
    this.painting = true;
    this.lastStampPoint = null;
    this.strokeTo(point);
    this.queueRender();
  }

  private endStroke(): void {
    this.painting = false;
    this.lastStampPoint = null;
  }

  /** A stroke that turned out to be the start of a pinch: end it and take its paint back. */
  private abandonStroke(): void {
    if (!this.painting) return;
    this.endStroke();
    this.undo();
    this.redoStack.pop();
    this.syncHistoryFlags();
  }

  /**
   * The cursor is the real footprint of the next stamp: the hex cells it
   * would touch, at the resolution the layer would pick. Nothing else.
   */
  private updateCursor(lngLat: LngLat): void {
    if (!this.canPaint()) {
      this.hideCursor();
      return;
    }
    const at = { lat: lngLat.lat, lon: lngLat.lng };
    this.gameMap.setCursorFootprint(
      this.layer.stampCells(at, this.brushRadiusKm(lngLat.lat)),
      this.tool.value === "erase",
    );
  }

  private hideCursor(): void {
    this.gameMap.setCursorFootprint(null);
  }

  private stampAt(lngLat: LngLat): void {
    const sign = this.tool.value === "erase" ? -1 : 1;
    // Stamps overlap along a stroke, so scale each one down.
    this.layer.stamp(
      { lat: lngLat.lat, lon: lngLat.lng },
      this.brushRadiusKm(lngLat.lat),
      sign * this.strength.value * 0.3,
    );
  }

  private strokeTo(point: Point): void {
    const map = this.gameMap.map;
    if (!this.lastStampPoint) {
      this.stampAt(map.unproject(point));
      this.lastStampPoint = point;
      return;
    }
    const start = this.lastStampPoint;
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    const dist = Math.hypot(dx, dy);
    const step = Math.max(2, this.brushPx.value / 4);
    if (dist < step) return;
    const n = Math.floor(dist / step);
    for (let i = 1; i <= n; i++) {
      const t = (i * step) / dist;
      const p = new Point(start.x + dx * t, start.y + dy * t);
      this.stampAt(map.unproject(p));
      this.lastStampPoint = p;
    }
  }

  private queueRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.gameMap.setPaint(this.layer.toGeoJSON());
      this.version.value++;
    });
  }
}
