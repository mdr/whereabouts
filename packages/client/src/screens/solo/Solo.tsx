/**
 * Single-player practice mode. Playtest tools live in the dev drawer. It asks
 * the types of question chosen on the front page, from the same pools as a
 * game, in an endless shuffle.
 */
import { AREA_TYPES, CATALOGUE, poolOf } from "@whereabouts/shared/catalogue/catalogue"
import { MapView } from "../../ui/map/MapView"
import { LoadingOutlines } from "../../ui/map/LoadingOutlines"
import { useVrHold } from "../../ui/VrButton"
import { soloMapDetail, soloTypes } from "../../settings/settings"
import { useOutlines } from "../../data/outlines"
import { SoloGame } from "./SoloGame"

export function Solo() {
  useVrHold()
  return (
    <MapView>
      <SoloLoader />
    </MapView>
  )
}

/** The outlines come in their own chunk, fetched when a type painted whole is asked for. */
function SoloLoader() {
  const types = soloTypes.value
  const needed = types.some((t) => AREA_TYPES.includes(t))
  const loaded = useOutlines(needed)
  if (!loaded && needed) return <LoadingOutlines />
  return <SoloGame pool={poolOf(CATALOGUE, types, soloMapDetail.value)} outlines={loaded ?? new Map()} />
}
