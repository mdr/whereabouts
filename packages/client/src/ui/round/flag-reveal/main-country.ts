import type { Borders, PaintedCountry } from "@whereabouts/shared/borders"
import type { PaintCell } from "@whereabouts/shared/paint/paint"

/** Below this share of the paint, no one country is named for it. */
const MIN_SHARE = 0.2

/** The country with most of the paint, if it has at least MIN_SHARE of it. */
export const mainCountry = (borders: Borders, cells: Iterable<PaintCell>): PaintedCountry | undefined => {
  const top = borders.paintedCountries(cells)[0]
  return top && top.share >= MIN_SHARE ? top : undefined
}
