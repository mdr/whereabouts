/** The paint layer's filter and opacity for a PaintFocus. */
import type { ExpressionSpecification, FilterSpecification } from "maplibre-gl"
import type { PlayerId } from "@whereabouts/shared/ids"
import type { PaintValue } from "./map-paint"
import { PLAYER_OPACITY } from "./player-ramp"
import { PaintFocusType, type PaintFocus } from "./paint-focus"

/** How much of its opacity a dimmed player's paint keeps. */
const DIMMED = 0.15

const isPlayer = (player: PlayerId): ExpressionSpecification => ["==", ["get", "player"], player]

export const paintFocusStyle = (
  focus: PaintFocus
): { filter: FilterSpecification | undefined; opacity: PaintValue<"fill", "fill-opacity"> } => {
  switch (focus.type) {
    case PaintFocusType.ALL:
      return { filter: undefined, opacity: PLAYER_OPACITY }
    case PaintFocusType.NONE:
      return { filter: ["boolean", false], opacity: PLAYER_OPACITY }
    case PaintFocusType.ONLY:
      return { filter: isPlayer(focus.player), opacity: PLAYER_OPACITY }
    case PaintFocusType.HIGHLIGHT:
      return {
        filter: undefined,
        opacity: ["case", isPlayer(focus.player), PLAYER_OPACITY, ["*", DIMMED, PLAYER_OPACITY]]
      }
  }
}
