/**
 * The player's paint (PaintModel) on the MapLibre map: drawn there as it
 * changes (PaintView) and painted there with the brush (PaintInput). Screens
 * configure it and read its signals; it never knows about game phases.
 */
import type { CssColour } from "@whereabouts/shared/colours"
import type { PaintLayer } from "@whereabouts/shared/paint/paint"
import type { LatLon } from "@whereabouts/shared/geo"
import type { GameMap } from "../map/map"
import { PaintModel } from "./paint-model"
import { PaintView } from "./paint-view"
import { PaintInput } from "./paint-input"
import type { Km, Px } from "@whereabouts/shared/units"

export class PaintController extends PaintModel {
  readonly gameMap: GameMap
  private readonly view: PaintView
  private readonly input: PaintInput
  readonly tool: PaintInput["tool"]
  readonly brushRadius: PaintInput["brushRadius"]
  readonly strength: PaintInput["strength"]
  readonly enabled: PaintInput["enabled"]

  constructor(gameMap: GameMap) {
    super()
    this.gameMap = gameMap
    this.view = new PaintView(gameMap, this)
    this.input = new PaintInput(gameMap, this, this.view)
    this.tool = this.input.tool
    this.brushRadius = this.input.brushRadius
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

  override reset(tolerance: Km): void {
    super.reset(tolerance)
    this.view.draw()
  }

  showLayers(entries: { layer: PaintLayer; colour: CssColour }[]): GeoJSON.FeatureCollection {
    return this.view.showLayers(entries)
  }

  showColoured(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
    return this.view.showColoured(features)
  }

  showOwn(colour?: CssColour): void {
    this.view.showOwn(colour)
  }

  onHover(listener: (pos: LatLon) => void): () => void {
    return this.input.onHover(listener)
  }

  setBrushSize(size: Px): void {
    this.input.setBrushSize(size)
  }
}
