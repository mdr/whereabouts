import { useEffect, useState } from "preact/hooks"
import type { MapMouseEvent } from "maplibre-gl"
import type { Borders } from "@whereabouts/shared/borders"
import type { FlagQuestion } from "@whereabouts/shared/questions"
import type { Ms, Px } from "@whereabouts/shared/units"
import type { GameMap } from "../../../map/map"
import { SmallFlag } from "../../pictures/SmallFlag"
import s from "./FlagHover.module.css"

/** How near the pointer a small country's answer counts as under it: Tuvalu is far less than a pixel at world zoom. */
const SMALL: Px = 12

/** How long after a touch a mouseout is taken for the browser's emulation, not the pointer leaving. */
const TOUCH_EMULATION: Ms = 1000

/**
 * A card by the pointer with the flag and name of the country under it
 * (or tapped, on a phone).
 */
export function FlagHover({ gameMap, borders }: { gameMap: GameMap; borders: Borders }) {
  const [hit, setHit] = useState<{ f: FlagQuestion; x: Px; y: Px } | undefined>(undefined)
  useEffect(() => {
    const map = gameMap.map
    const show = (e: MapMouseEvent) => {
      const p = { lat: e.lngLat.lat, lon: e.lngLat.lng }
      const f = borders.countryAt(p) ?? borders.smallNear(p, (SMALL * gameMap.metresPerPixel(p.lat)) / 1000)
      setHit(f ? { f, x: e.originalEvent.clientX, y: e.originalEvent.clientY } : undefined)
    }
    const hide = () => setHit(undefined)
    // A mouse hovers; a finger taps (a click), and the card stays until the
    // next tap or a drag. A tap is followed by emulated mouse events, a
    // mouseout among them (in Chrome), which must not hide it.
    let touchedAt = 0
    const touched = () => (touchedAt = Date.now())
    const out = () => Date.now() - touchedAt > TOUCH_EMULATION && hide()
    map.on("mousemove", show)
    map.on("click", show)
    map.on("touchend", touched)
    map.on("mouseout", out)
    map.on("dragstart", hide)
    return () => {
      map.off("mousemove", show)
      map.off("click", show)
      map.off("touchend", touched)
      map.off("mouseout", out)
      map.off("dragstart", hide)
    }
  }, [gameMap, borders])
  if (!hit) return undefined
  // Beside the pointer, flipped left near the right edge so it stays on screen.
  const left = hit.x > window.innerWidth - 220
  return (
    <div
      class={s.hover}
      style={{
        top: `${hit.y + 14}px`,
        ...(left ? { right: `${window.innerWidth - hit.x + 14}px` } : { left: `${hit.x + 14}px` })
      }}
    >
      <SmallFlag code={hit.f.clue.flag} class={s.hoverFlag} />
      <span>{hit.f.label}</span>
    </div>
  )
}
