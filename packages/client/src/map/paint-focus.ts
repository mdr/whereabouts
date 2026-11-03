/**
 * Which players' paint shows, when the paint source holds several players'
 * features, each with its `player`. Changing it restyles the layer, which is
 * instant, where new data would be re-tiled and flash.
 */
import type { PlayerId } from "@whereabouts/shared/ids"

export enum PaintFocusType {
  ALL = "ALL",
  NONE = "NONE",
  /** One player's paint alone. */
  ONLY = "ONLY",
  /** One player's paint, the others' dimmed behind it. */
  HIGHLIGHT = "HIGHLIGHT"
}

interface AllFocus {
  type: PaintFocusType.ALL
}

interface NoneFocus {
  type: PaintFocusType.NONE
}

interface OnlyFocus {
  type: PaintFocusType.ONLY
  player: PlayerId
}

interface HighlightFocus {
  type: PaintFocusType.HIGHLIGHT
  player: PlayerId
}

export type PaintFocus = AllFocus | NoneFocus | OnlyFocus | HighlightFocus

export const FOCUS_ALL: AllFocus = { type: PaintFocusType.ALL }
