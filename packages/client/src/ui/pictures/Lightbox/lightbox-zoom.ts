import type { Px } from "@whereabouts/shared/units"

export interface Position {
  x: Px
  y: Px
}

export interface ZoomView {
  zoom: number
  pan: Position
}

export const MAX_ZOOM = 6
export const CLICK_ZOOM = 2.5

/**
 * The view after zooming by `factor`, keeping `anchor` (relative to the frame centre) fixed;
 * undefined when the clamp to 1-6 leaves the zoom as it was. Back at 1 the pan resets.
 */
export const nextZoom = ({ zoom, pan }: ZoomView, factor: number, anchor: Position): ZoomView | undefined => {
  const next = Math.min(MAX_ZOOM, Math.max(1, zoom * factor))
  if (next === zoom) return undefined
  const relative = next / zoom
  return {
    zoom: next,
    pan:
      next === 1
        ? { x: 0, y: 0 }
        : { x: pan.x * relative + anchor.x * (1 - relative), y: pan.y * relative + anchor.y * (1 - relative) }
  }
}
