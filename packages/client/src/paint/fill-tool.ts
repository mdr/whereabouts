import { useEffect } from "preact/hooks"
import type { PaintController } from "./paint-controller"
import { CountryFiller } from "./country-fill"
import { FillType } from "./fill-target"
import { useBorders } from "../data/borders"
import { useOutlines } from "../data/outlines"
import { useIslands } from "../data/islands"

/**
 * Offer the Fill tool for `type` (countries or islands), or none: load what
 * it fills if need be, and hand that to the paint controller.
 */
export const useFillTool = (
  paint: Pick<PaintController, "useFiller" | "offerFill">,
  type: FillType | undefined
): void => {
  const countries = type === FillType.COUNTRY
  const borders = useBorders(countries)
  const outlines = useOutlines(countries)
  const islands = useIslands(type === FillType.ISLAND)
  useEffect(() => {
    if (borders && outlines) paint.useFiller(new CountryFiller(borders, outlines))
    if (islands) paint.useFiller(islands)
    paint.offerFill(type)
  }, [paint, type, borders, outlines, islands])
  useEffect(() => () => paint.offerFill(undefined), [paint])
}
