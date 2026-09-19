/**
 * Player colours for the multiplayer reveal. Chosen to stay distinct on the
 * dark-ops basemap and away from the amber answer marker. Cycles past eight.
 */
export const PLAYER_COLOURS = [
  "#4fc3f7", // sky
  "#f06292", // pink
  "#aed581", // lime
  "#ba68c8", // violet
  "#ff8a65", // coral
  "#4db6ac", // teal
  "#e6ee9c", // pale yellow-green
  "#90a4ae", // blue grey
] as const;

export function playerColour(index: number): string {
  return PLAYER_COLOURS[index % PLAYER_COLOURS.length]!;
}
