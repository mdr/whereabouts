import { useEffect } from "preact/hooks"
import { Marker } from "maplibre-gl"
import type { Borders } from "@whereabouts/shared/borders"
import type { Px } from "@whereabouts/shared/units"
import type { GameMap } from "../../../../map/map"
import { flagPins } from "../../../../data/borders"
import { FLAG_ATLAS, atlasCell } from "../../../../flags/flag-atlas"
import { allFlagsTestIds } from "./AllFlagsTestIds"
import s from "./AllFlags.module.css"

/** The flag atlas is drawn at this many times the size shown. */
const ATLAS_PX_PER_CSS_PX = 4

/** Every country's flag, on a pin stuck in its land. */
export function AllFlags({ gameMap, borders }: { gameMap: GameMap; borders: Borders }) {
  useEffect(() => {
    const markers = flagPins(borders).map(({ f, at }) => {
      const el = document.createElement("div")
      el.className = s.pin
      el.dataset.testid = allFlagsTestIds.pin
      const flag = document.createElement("i")
      flag.title = f.label
      const cell = atlasCell(f.clue.flag)
      if (cell) {
        const css = (atlasPx: number): Px => atlasPx / ATLAS_PX_PER_CSS_PX
        flag.style.width = `${css(cell.w)}px`
        flag.style.backgroundImage = `url(${FLAG_ATLAS.url})`
        flag.style.backgroundSize = `${css(FLAG_ATLAS.width)}px ${css(FLAG_ATLAS.height)}px`
        flag.style.backgroundPosition = `${css(-cell.x)}px ${css(-cell.y)}px`
      }
      el.append(flag)
      // On the far side of the globe, hidden rather than faded.
      return new Marker({ element: el, anchor: "bottom-left", opacityWhenCovered: "0" })
        .setLngLat([at.lon, at.lat])
        .addTo(gameMap.map)
    })
    return () => {
      for (const m of markers) m.remove()
    }
  }, [gameMap, borders])
  return undefined
}
