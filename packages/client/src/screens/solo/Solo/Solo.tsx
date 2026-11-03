/**
 * Practice: the game's own screens over a PracticeGameService. It asks the
 * types of question chosen on the front page, from the same pools as a game.
 */
import { AREA_TYPES, CATALOGUE, poolOf } from "@whereabouts/shared/catalogue/catalogue"
import { MapView } from "../../../ui/map/MapView/MapView"
import { LoadingOutlines } from "../../../ui/map/LoadingOutlines/LoadingOutlines"
import { useVrHold } from "../../../ui/VrButton/VrButton"
import { soloMapDetail, soloTypes } from "../../../settings/settings"
import { useOutlines } from "../../../data/outlines"
import { PracticeGame } from "../PracticeGame/PracticeGame"

/** The outlines come in their own chunk, fetched when a type painted whole is asked for. */
export const Solo = () => {
  useVrHold()
  const types = soloTypes.value
  const needed = types.some((type) => AREA_TYPES.includes(type))
  const loaded = useOutlines(needed)
  if (!loaded && needed)
    return (
      <MapView>
        <LoadingOutlines />
      </MapView>
    )
  return <PracticeGame pool={poolOf(CATALOGUE, types, soloMapDetail.value)} outlines={loaded ?? new Map()} />
}
