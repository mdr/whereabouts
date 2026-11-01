import { colourCss, playerColour } from "@whereabouts/shared/colours"

/** A and B of a pair, on the map and beside their scores. */
export const PAIR_COLOURS = [colourCss(playerColour(0)), colourCss(playerColour(1))] as const
