/**
 * Colour themes. Each recolours the basemap layers in place, sets the paint
 * ramp for the painted distribution, and picks a contrasting colour for the
 * answer marker, tolerance rings, and cursor.
 */
export interface Theme {
  id: string;
  label: string;
  /** Basemap */
  land: string;
  water: string;
  wood: string;
  ice: string;
  waterway: string;
  border: string;
  road: string;
  urban: string;
  labelText: string;
  labelHalo: string;
  /** Paint ramp: colours at intensity 0, 1/3, 2/3, 1 (relative to the peak). */
  ramp: [string, string, string, string];
  /** Fill opacity at intensity 0 and 1. */
  rampOpacity: [number, number];
  /** Answer marker, reveal rings, and the cursor's tolerance ring. */
  answer: string;
  answerStroke: string;
  /** Cursor brush ring. */
  brush: string;
}

/** The chosen theme. The alternatives below were playtested and passed over. */
export const THEME: Theme = {
  id: "dark-ops",
  label: "Dark ops (cyan glow)",
  land: "#2c3644",
  water: "#131a23",
  wood: "#2f3b45",
  ice: "#3b4755",
  waterway: "#1d3345",
  border: "#7b8a9c",
  road: "#465569",
  urban: "#344150",
  labelText: "#cfd8e3",
  labelHalo: "#131a23",
  ramp: ["#0e7490", "#06b6d4", "#67e8f9", "#f0fdff"],
  rampOpacity: [0.08, 0.92],
  answer: "#fbbf24",
  answerStroke: "#1a1a1a",
  brush: "#ffffff",
};

export const ALTERNATIVE_THEMES: Theme[] = [
  {
    id: "viridis",
    label: "Viridis on slate",
    land: "#323a45",
    water: "#1b2029",
    wood: "#353f47",
    ice: "#404a56",
    waterway: "#26313d",
    border: "#8391a3",
    road: "#4a5768",
    urban: "#3a4552",
    labelText: "#d3dae3",
    labelHalo: "#1b2029",
    ramp: ["#440154", "#31688e", "#35b779", "#fde725"],
    rampOpacity: [0.08, 0.92],
    answer: "#ff4fd8",
    answerStroke: "#ffffff",
    brush: "#ffffff",
  },
  {
    id: "paper",
    label: "Paper map (indigo ink)",
    land: "#f3ead8",
    water: "#a9bfcf",
    wood: "#e4e6cf",
    ice: "#ffffff",
    waterway: "#8fa9bd",
    border: "#b6a789",
    road: "#d7cab0",
    urban: "#eadcc1",
    labelText: "#4a4030",
    labelHalo: "#f3ead8",
    ramp: ["#e9e3f7", "#a78bdb", "#6b46c1", "#2e1065"],
    rampOpacity: [0.1, 0.92],
    answer: "#d9381e",
    answerStroke: "#ffffff",
    brush: "#222222",
  },
];
