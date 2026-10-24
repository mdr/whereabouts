/**
 * Every flag country's flag in one picture (see scripts/build-flag-atlas.mjs),
 * for showing them all at once: one picture to load, not 194 to draw.
 */
import atlas from "./flag-atlas.json"
import url from "./assets/flag-atlas.webp"

export const FLAG_ATLAS = {
  url,
  columns: atlas.columns,
  rows: Math.ceil(atlas.codes.length / atlas.columns),
  cell: atlas.cell as [number, number]
}

const index = new Map(atlas.codes.map((c, i) => [c, i]))

/** A flag's cell in the picture, by column and row, if it has one. */
export function atlasCell(code: string): [number, number] | undefined {
  const i = index.get(code)
  return i === undefined ? undefined : [i % atlas.columns, Math.floor(i / atlas.columns)]
}
