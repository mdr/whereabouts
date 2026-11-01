import type { FilterSpecification, Map as MapLibreMap, StyleSpecification } from "maplibre-gl"
import {
  COLOUR_LAYER,
  REVEAL_BORDER_OPACITY,
  REVEAL_BORDER_WIDTH,
  STATE_BORDERS,
  STATE_LABELS,
  TERRAIN_LAYER
} from "./map-layers"
import { applyPaint, setPaint, type PaintSetting } from "./map-paint"
import { styleLayerPaint } from "./map-theme"
import {
  RevealDetail,
  showsBorders,
  showsInlandWater,
  showsPlaces,
  showsTerrain,
  type ShownDetail
} from "./shown-detail"
import { emptyStyleIndex, indexStyle, NATIONAL_BORDERS, PLACE_LABELS, type StyleIndex } from "./style-index"
import type { Theme } from "./themes"

/** Which of the style's own layers show, and how its borders are drawn. Does nothing until `index` has run. */
export class DetailLayers {
  private styles: StyleIndex = emptyStyleIndex()
  private revealBorders = false
  private theme: Theme | undefined = undefined
  /** Set once the map is removed; toggles become no-ops rather than throwing. */
  private disposed = false

  constructor(private readonly map: MapLibreMap) {}

  /** The style's text layers, for the game's own labels to sit below. */
  get labels(): readonly string[] {
    return this.styles.labels
  }

  /** Sort the loaded style's layers. */
  index(style: StyleSpecification): void {
    this.styles = indexStyle(
      style.layers,
      (id) => ({
        width: this.map.getPaintProperty(id, "line-width"),
        opacity: this.map.getPaintProperty(id, "line-opacity")
      }),
      (id) => this.map.getFilter(id)
    )
  }

  /** Effects that unmount alongside the map may still toggle detail afterwards, and MapLibre throws on a removed map. */
  dispose(): void {
    this.disposed = true
  }

  applyTheme(theme: Theme): void {
    this.theme = theme
    for (const setting of this.styles.styleLayers.flatMap((layer) => styleLayerPaint(layer, theme)))
      this.setPaintIfPresent(setting)
    this.styleBorders()
  }

  private setPaintIfPresent(setting: PaintSetting): void {
    if (this.map.getLayer(setting.layer)) applyPaint(this.map, setting)
  }

  /**
   * How much of the map shows: one of the game's guessing levels, or
   * RevealDetail.REVEAL for everything but roads (they clutter at the zooms the
   * reveal uses). Place names and man-made detail show only on the reveal.
   */
  setDetail(level: ShownDetail): void {
    this.setInlandWater(showsInlandWater(level))
    this.setTerrain(showsTerrain(level))
    this.setVisible(this.styles.ice, showsTerrain(level))
    this.setVisible(this.styles.wood, showsTerrain(level))
    this.setBorders(showsBorders(level), showsPlaces(level))
    this.setRevealBorders(level === RevealDetail.REVEAL)
    this.setLabels(showsPlaces(level))
    this.setVisible(this.styles.urban, showsPlaces(level))
    this.setVisible(this.styles.roads, false)
  }

  /**
   * For the reveal of a state round: state lines and names at every zoom,
   * without town and city names. Never while guessing one. Call after setDetail.
   */
  setStateReveal(on: boolean): void {
    this.setVisible([STATE_BORDERS, STATE_LABELS], on)
    if (on) this.setVisible(PLACE_LABELS, false)
  }

  private setLabels(on: boolean): void {
    if (this.disposed) return
    for (const id of this.styles.labels) this.map.setLayoutProperty(id, "visibility", on ? "visible" : "none")
  }

  /** Shaded relief and natural colour. */
  private setTerrain(on: boolean): void {
    this.setVisible([TERRAIN_LAYER, COLOUR_LAYER], on)
  }

  private setVisible(ids: string[], on: boolean): void {
    if (this.disposed) return
    for (const id of ids) {
      if (this.map.getLayer(id)) this.map.setLayoutProperty(id, "visibility", on ? "visible" : "none")
    }
  }

  /** Rivers and lakes. Oceans always stay visible so coastlines remain. */
  private setInlandWater(on: boolean): void {
    if (this.disposed) return
    for (const id of this.styles.waterways) this.map.setLayoutProperty(id, "visibility", on ? "visible" : "none")
    if (!this.map.getLayer("water")) return
    const base = this.styles.waterFilter as FilterSpecification | undefined
    const oceanOnly = ["==", ["get", "class"], "ocean"] as unknown as FilterSpecification
    const combined = (base ? ["all", base, oceanOnly] : oceanOnly) as unknown as FilterSpecification
    this.map.setFilter("water", on ? base : combined)
  }

  /** National borders, and with `subnational` the style's state and province lines (zoom 8 on). */
  private setBorders(on: boolean, subnational: boolean): void {
    if (this.disposed) return
    for (const id of this.styles.borders) {
      const shown = on && (subnational || NATIONAL_BORDERS.includes(id))
      this.map.setLayoutProperty(id, "visibility", shown ? "visible" : "none")
    }
  }

  /** Bold national borders for the reveal, or the style's faint ones. */
  private setRevealBorders(on: boolean): void {
    this.revealBorders = on
    this.styleBorders()
  }

  private styleBorders(): void {
    if (this.disposed || !this.theme) return
    for (const id of this.styles.borders) {
      if (!this.map.getLayer(id)) continue
      const own = this.styles.nationalBorderPaint.get(id)
      const bold = this.revealBorders && own !== undefined
      setPaint(this.map, id, "line-color", bold ? this.theme.revealBorder : this.theme.border)
      if (!own) continue
      setPaint(this.map, id, "line-width", bold ? REVEAL_BORDER_WIDTH : own.width)
      setPaint(this.map, id, "line-opacity", bold ? REVEAL_BORDER_OPACITY : own.opacity)
    }
  }
}
