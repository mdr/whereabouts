import type { LayerSpecification, Map as MapLibreMap } from "maplibre-gl"

/** A MapLibre layer type: "fill", "line", and so on. */
export type LayerKind = LayerSpecification["type"]

type PaintOf<K extends LayerKind> = NonNullable<Extract<LayerSpecification, { type: K }>["paint"]>

/** The paint properties a layer of this kind has. */
export type PaintProperty<K extends LayerKind> = keyof PaintOf<K>

/** What one paint property of a layer of this kind accepts: a value, a function or an expression. */
export type PaintValue<K extends LayerKind, P extends PaintProperty<K>> = PaintOf<K>[P]

declare const kind: unique symbol

/** A layer's id, carrying its kind as the units do: a plain string is accepted, one of another kind is not. */
export type LayerId<K extends LayerKind> = string & { readonly [kind]?: K }

/** One paint property of one layer, set only through `paintSetting`, which checks it against the layer's kind. */
export interface PaintSetting {
  layer: string
  property: string
  value: unknown
}

export const paintSetting = <K extends LayerKind, P extends PaintProperty<K>>(
  layer: LayerId<K>,
  property: P,
  value: PaintValue<K, P>
): PaintSetting => {
  return { layer, property: String(property), value }
}

/** MapLibre's setPaintProperty takes the union of every layer's properties; a PaintSetting was checked against its layer's kind. */
export const applyPaint = (map: MapLibreMap, { layer, property, value }: PaintSetting): void => {
  map.setPaintProperty(layer, property as never, value as never)
}

export const setPaint = <K extends LayerKind, P extends PaintProperty<K>>(
  map: MapLibreMap,
  layer: LayerId<K>,
  property: P,
  value: PaintValue<K, P>
): void => {
  applyPaint(map, paintSetting(layer, property, value))
}

/** The id of a style layer if it is of this kind, so its settings can be checked. */
export const idOfKind = <K extends LayerKind>(
  layer: { id: string; type: LayerKind },
  wanted: K
): LayerId<K> | undefined => {
  return layer.type === wanted ? layer.id : undefined
}
