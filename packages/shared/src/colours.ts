/**
 * Player colours for the multiplayer reveal, one per player (MAX_PLAYERS).
 * The first eight are the original set. The second eight were picked to stay
 * visible on the reveal's terrain colouring and away from the amber answer
 * marker, and as far as possible from the first eight and from each other,
 * colour-blind vision included (the analysis behind them measured each
 * against captures of the real map). Players can still pick one guess out
 * from the reveal's list when two look alike.
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
  "#c32222", // brick red
  "#edd2c0", // pale peach
  "#adffff", // pale aqua
  "#b23466", // raspberry
  "#0aff0a", // bright green
  "#f9b4d6", // pale pink
  "#5c9dff", // cornflower blue
  "#ff3b0a", // red orange
] as const;

export function playerColour(index: number): string {
  return PLAYER_COLOURS[index % PLAYER_COLOURS.length]!;
}
