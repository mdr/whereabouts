/**
 * The player's paint (PaintModel) on the MapLibre map: drawn there as it
 * changes (PaintView) and painted there with the brush (PaintInput). Screens
 * configure it and read its signals; it never knows about game phases.
 */
import type { PaintLayer } from "@whereabouts/shared/paint"
import type { LatLon } from "@whereabouts/shared/geo"
import type { GameMap } from "./map"
import { PaintModel } from "./paint-model"
import { PaintView } from "./paint-view"
import { PaintInput } from "./paint-input"

export class PaintController extends PaintModel {
  readonly gameMap: GameMap
  private readonly view: PaintView
  private readonly input: PaintInput
  readonly tool: PaintInput["tool"]
  readonly brushPx: PaintInput["brushPx"]
  readonly strength: PaintInput["strength"]
  readonly enabled: PaintInput["enabled"]

  constructor(gameMap: GameMap) {
    super()
    this.gameMap = gameMap
    this.view = new PaintView(gameMap, this)
    this.input = new PaintInput(gameMap, this, this.view)
    this.tool = this.input.tool
    this.brushPx = this.input.brushPx
    this.strength = this.input.strength
    this.enabled = this.input.enabled
  }

  override dispose(): void {
    super.dispose()
    this.view.dispose()
    this.input.dispose()
  }

  protected override changed(): void {
    this.view.queue()
  }

  override reset(toleranceKm: number): void {
    super.reset(toleranceKm)
    this.view.draw()
  }

  showLayers(entries: { layer: PaintLayer; colour: string }[]): GeoJSON.FeatureCollection {
    return this.view.showLayers(entries)
  }

  showColoured(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
    return this.view.showColoured(features)
  }

  showOwn(colour?: string): void {
    this.view.showOwn(colour)
  }

  onHover(listener: (pos: LatLon) => void): () => void {
    return this.input.onHover(listener)
  }

  setBrushPx(px: number): void {
    this.input.setBrushPx(px)
  }
}
