/**
 * Every flag country's flag in one picture (see scripts/build-flag-atlas.mjs),
 * for showing them all at once: one picture to load, not 194 to draw.
 */
import atlas from "./flag-atlas.json"
import url from "./assets/flag-atlas.webp"

const [cellW, cellH] = atlas.cell as [number, number]
const rows = Math.ceil(atlas.codes.length / atlas.columns)

export const FLAG_ATLAS = {
  url,
  /** The picture's size in pixels. */
  width: atlas.columns * cellW,
  height: rows * cellH
}

const index = new Map(atlas.codes.map((c, i) => [c, i]))

/** Where a flag is in the picture, in pixels, if it is there: each in its own shape. */
export function atlasCell(code: string): { x: number; y: number; w: number; h: number } | undefined {
  const i = index.get(code)
  if (i === undefined) return undefined
  return { x: (i % atlas.columns) * cellW, y: Math.floor(i / atlas.columns) * cellH, w: atlas.widths[i]!, h: cellH }
}
