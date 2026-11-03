/**
 * Paint in a player's colour, ramped by how heavily it is painted: from a
 * dark shade where it is light to a pale tint where it is heaviest, more
 * opaque as it goes. The tint stops short of white so players stay apart.
 */
import type { CssColour } from "@whereabouts/shared/colours"
import type { ExpressionSpecification } from "maplibre-gl"

type Rgb = [red: number, green: number, blue: number]

/** How far towards black the lightest paint goes, and towards white the heaviest. */
const SHADE = 0.55
const TINT = 0.45
const OPACITY = { atZero: 0.15, atPeak: 0.9 }

const rgbOf = (colour: CssColour): Rgb => {
  const packed = parseInt(colour.slice(1), 16)
  return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255]
}

const towards = (from: Rgb, to: Rgb, share: number): Rgb =>
  from.map((value, i) => Math.round(value + (to[i]! - value) * share)) as Rgb

const css = ([red, green, blue]: Rgb): CssColour =>
  `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`

export interface PlayerRamp {
  shade: CssColour
  colour: CssColour
  tint: CssColour
}

export const playerRamp = (colour: CssColour): PlayerRamp => {
  const rgb = rgbOf(colour)
  return { shade: css(towards(rgb, [0, 0, 0], SHADE)), colour, tint: css(towards(rgb, [255, 255, 255], TINT)) }
}

/** The colour and opacity of paint of weight `v` (0 to 1 of the heaviest), as the map mixes them. */
export const playerRampAt = (ramp: PlayerRamp, v: number): { colour: Rgb; opacity: number } => {
  const weight = Math.min(1, Math.max(0, v))
  const [from, to, share] =
    weight < 0.5 ? [ramp.shade, ramp.colour, weight * 2] : [ramp.colour, ramp.tint, weight * 2 - 1]
  return {
    colour: towards(rgbOf(from), rgbOf(to), share),
    opacity: OPACITY.atZero + (OPACITY.atPeak - OPACITY.atZero) * weight
  }
}

export const PLAYER_OPACITY: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["get", "v"],
  0,
  OPACITY.atZero,
  1,
  OPACITY.atPeak
]

/** The map's fill colour for one player's ramp. */
export const rampFill = (ramp: PlayerRamp): ExpressionSpecification => [
  "interpolate",
  ["linear"],
  ["get", "v"],
  0,
  ramp.shade,
  0.5,
  ramp.colour,
  1,
  ramp.tint
]

/** The map's fill colour for features that each carry their own ramp (a PlayerRamp in their properties). */
export const RAMP_FILL_PER_FEATURE: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["get", "v"],
  0,
  ["to-color", ["coalesce", ["get", "shade"], "#888888"]],
  0.5,
  ["to-color", ["coalesce", ["get", "colour"], "#888888"]],
  1,
  ["to-color", ["coalesce", ["get", "tint"], "#888888"]]
]
