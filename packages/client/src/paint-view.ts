/** Drawing paint on the map: our own as it changes, or other players'. */
import type { PaintLayer } from "@whereabouts/shared/paint"
import type { GameMap } from "./map"
import type { PaintModel } from "./paint-model"

/** How long a change waits for an animation frame before `version` moves without one. */
const VERSION_WAIT_MS = 100

export class PaintView {
  /** The frame that will draw our paint, while one is queued. */
  private renderFrame: number | undefined = undefined
  private versionTimer: number | undefined = undefined
  private readonly gameMap: GameMap
  private readonly model: PaintModel

  constructor(gameMap: GameMap, model: PaintModel) {
    this.gameMap = gameMap
    this.model = model
  }

  dispose(): void {
    window.clearTimeout(this.versionTimer)
  }

  /** Draw our paint on the next frame, and count the change then. */
  queue(): void {
    // A VR headset runs no window animation frames while it shows its session,
    // and what follows `version` (uploads, Undo, Pass) must still hear of the
    // change. The map draws once frames come back.
    this.versionTimer ??= window.setTimeout(() => {
      this.versionTimer = undefined
      this.model.publish()
    }, VERSION_WAIT_MS)
    if (this.renderFrame !== undefined) return
    this.renderFrame = requestAnimationFrame(() => {
      this.renderFrame = undefined
      window.clearTimeout(this.versionTimer)
      this.versionTimer = undefined
      this.gameMap.setPaint(this.model.layer.toGeoJSON())
      this.model.publish()
    })
  }

  /** Drop a queued draw, still counting the change it was for. */
  cancel(): void {
    if (this.renderFrame === undefined) return
    cancelAnimationFrame(this.renderFrame)
    this.renderFrame = undefined
    window.clearTimeout(this.versionTimer)
    this.versionTimer = undefined
    this.model.publish()
  }

  /**
   * Show several players' paint at once, each in its own colour. Earlier
   * entries draw underneath later ones. Returns the combined GeoJSON so the
   * caller can frame it.
   */
  showLayers(entries: { layer: PaintLayer; colour: string }[]): GeoJSON.FeatureCollection {
    return this.showColoured(
      entries.flatMap(({ layer, colour }) =>
        layer.toGeoJSON().features.map((f) => ({ ...f, properties: { ...f.properties, colour } }))
      )
    )
  }

  /** As showLayers, for features that already carry their `colour`. */
  showColoured(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
    const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features }
    this.gameMap.setPaintColourPerFeature()
    this.gameMap.setPaint(fc)
    return fc
  }

  /** Put our own paint back on the map, in a player colour or the theme ramp. */
  showOwn(colour?: string): void {
    this.gameMap.setPaintColour(colour)
    this.gameMap.setPaint(this.model.layer.toGeoJSON())
  }

  /** Draw our paint now. */
  draw(): void {
    this.gameMap.setPaint(this.model.layer.toGeoJSON())
  }
}
