/**
 * Colour themes. Each recolours the basemap layers in place, sets the paint
 * ramp for the painted distribution, and picks a contrasting colour for the
 * answer marker, tolerance rings, and cursor.
 */
import type { CssColour } from "@whereabouts/shared/colours"

export interface Theme {
  id: string
  label: string
  /** Basemap */
  land: CssColour
  water: CssColour
  wood: CssColour
  ice: CssColour
  waterway: CssColour
  border: CssColour
  /** National borders on the reveal, drawn bolder than while guessing. */
  revealBorder: CssColour
  road: CssColour
  urban: CssColour
  labelText: CssColour
  labelHalo: CssColour
  /** Paint ramp: colours at intensity 0, 1/3, 2/3, 1 (relative to the peak). */
  ramp: [CssColour, CssColour, CssColour, CssColour]
  /** Fill opacity at intensity 0 and 1. */
  rampOpacity: [atZero: number, atPeak: number]
  /** Answer marker. */
  answer: CssColour
  answerStroke: CssColour
  /** Cursor brush ring. */
  brush: CssColour
}

/** The chosen theme. The alternatives below were playtested and passed over. */
export const THEME: Theme = {
  id: "dark-ops",
  label: "Dark ops (cyan glow)",
  land: "#2c3644",
  water: "#131a23",
  wood: "#2f3b45",
  ice: "#3b4755",
  waterway: "#3b6a8c",
  border: "#7b8a9c",
  revealBorder: "#c4d0de",
  road: "#465569",
  urban: "#344150",
  labelText: "#cfd8e3",
  labelHalo: "#131a23",
  ramp: ["#0e7490", "#06b6d4", "#67e8f9", "#f0fdff"],
  rampOpacity: [0.08, 0.92],
  answer: "#fbbf24",
  answerStroke: "#1a1a1a",
  brush: "#ffffff"
}
