/**
 * The reveal of a flag round, beyond the answer: the flag of whatever
 * country is under the pointer (or tapped, on a phone), and which country
 * each player's paint was mostly in, so a wrong guess shows whose flag they
 * took it for.
 */
import { useEffect, useState } from "preact/hooks"
import { Marker, type MapMouseEvent } from "maplibre-gl"
import type { Borders, FlagQuestion, PaintCell, PaintedCountry } from "@whereabouts/shared"
import type { GameMap } from "../map"
import { SmallFlag } from "./bits"
import { flagPins } from "../borders"
import { FLAG_ATLAS, atlasCell } from "../flag-atlas"
import { allFlags } from "../settings"
import { flagRevealTestIds } from "./FlagRevealTestIds"

/** How near the pointer a small country's answer counts as under it: Tuvalu is far less than a pixel at world zoom. */
const SMALL_PX = 12

/** How long after a touch a mouseout is taken for the browser's emulation, not the pointer leaving. */
const TOUCH_MS = 1000

/** Below this share of the paint, no one country is named for it. */
const MIN_SHARE = 0.2

/** The country with most of the paint, if it has at least MIN_SHARE of it. */
export function mainCountry(borders: Borders, cells: Iterable<PaintCell>): PaintedCountry | undefined {
  const top = borders.paintedCountries(cells)[0]
  return top && top.share >= MIN_SHARE ? top : undefined
}

/** Every country's flag, on a pin stuck in its land. */
export function AllFlags({ gameMap, borders }: { gameMap: GameMap; borders: Borders }) {
  useEffect(() => {
    const markers = flagPins(borders).map(({ f, at }) => {
      const el = document.createElement("div")
      el.className = "flag-pin"
      const flag = document.createElement("i")
      flag.title = f.label
      const cell = atlasCell(f.flag)
      if (cell) {
        // The picture's cells are four times the size shown.
        const [w, h] = FLAG_ATLAS.cell.map((n) => n / 4) as [number, number]
        flag.style.backgroundImage = `url(${FLAG_ATLAS.url})`
        flag.style.backgroundSize = `${FLAG_ATLAS.columns * w}px ${FLAG_ATLAS.rows * h}px`
        flag.style.backgroundPosition = `${-cell[0] * w}px ${-cell[1] * h}px`
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

/** The switch for AllFlags. */
export function AllFlagsSwitch() {
  return (
    <label class="check switch all-flags-switch">
      <input
        type="checkbox"
        role="switch"
        checked={allFlags.value}
        onChange={(e) => (allFlags.value = (e.target as HTMLInputElement).checked)}
        data-testid={flagRevealTestIds.allFlagsSwitch}
      />
      Show all flags
    </label>
  )
}

/** A card by the pointer with the flag and name of the country under it. */
export function FlagHover({ gameMap, borders }: { gameMap: GameMap; borders: Borders }) {
  const [hit, setHit] = useState<{ f: FlagQuestion; x: number; y: number } | undefined>(undefined)
  useEffect(() => {
    const map = gameMap.map
    const show = (e: MapMouseEvent) => {
      const p = { lat: e.lngLat.lat, lon: e.lngLat.lng }
      const f = borders.countryAt(p) ?? borders.smallNear(p, gameMap.metersPerPixel(p.lat) / 1000, SMALL_PX)
      setHit(f ? { f, x: e.originalEvent.clientX, y: e.originalEvent.clientY } : undefined)
    }
    const hide = () => setHit(undefined)
    // A mouse hovers; a finger taps (a click), and the card stays until the
    // next tap or a drag. A tap is followed by emulated mouse events, a
    // mouseout among them (in Chrome), which must not hide it.
    let touchedAt = 0
    const touched = () => (touchedAt = Date.now())
    const out = () => Date.now() - touchedAt > TOUCH_MS && hide()
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
      class="flag-hover"
      style={{
        top: `${hit.y + 14}px`,
        ...(left ? { right: `${window.innerWidth - hit.x + 14}px` } : { left: `${hit.x + 14}px` })
      }}
    >
      <SmallFlag code={hit.f.flag} />
      <span>{hit.f.label}</span>
    </div>
  )
}

/** PaintedIn as a line of text, for the headset. */
export function paintedInText(where: PaintedCountry, answer?: string): string {
  const right = where.country.flag === answer
  return `Your paint: ${Math.round(where.share * 100)}% in ${where.country.label}${right ? ", the answer" : ""}`
}

/**
 * Where some paint mostly was: "[flag] Peru 62%", marked when it is the
 * answer. `whose` names the painter for the title: "your", "Ann's".
 */
export function PaintedIn({ where, answer, whose }: { where: PaintedCountry; answer?: string; whose: string }) {
  const pct = Math.round(where.share * 100)
  const right = where.country.flag === answer
  return (
    <span
      class={`painted-in ${right ? "right" : ""}`}
      title={`${pct}% of ${whose} paint was in ${where.country.label}${right ? ", the answer" : ""}`}
    >
      <SmallFlag code={where.country.flag} />
      <span class="country">{where.country.label}</span>
      <span class="share">{pct}%</span>
    </span>
  )
}
