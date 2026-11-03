import { useEffect } from "preact/hooks"
import { Phase, PictureType, type GameView, type Picture } from "@whereabouts/shared/protocol/views"
import { useGameService } from "../../game-service/use-game-service"
import { preloadPicture } from "../../data/preload"
import { useGameSounds } from "../../sound/useGameSounds"
import { MapView } from "../../ui/map/MapView/MapView"
import { InGame } from "../InGame/InGame"
import { Lobby } from "../lobby/Lobby/Lobby"
import { Results } from "../results/Results/Results"

const pictureSource = (picture: Picture | undefined): string | undefined =>
  picture && (picture.type === PictureType.PHOTO ? picture.photo : picture.flag)

const upcomingOf = (view: GameView) => (view.phase !== Phase.RESULTS ? view.upcoming : undefined)

/** Which screen a game's view calls for, online or practice. */
export const GameScreen = ({ view }: { view: GameView }) => {
  const game = useGameService()
  useGameSounds(game, view)
  const upcoming = upcomingOf(view)
  useEffect(() => {
    if (upcoming) preloadPicture(upcoming)
  }, [pictureSource(upcoming)])

  if (view.phase === Phase.LOBBY) return <Lobby view={view} />
  if (view.phase === Phase.RESULTS) return <Results view={view} />
  return (
    <MapView>
      <InGame view={view} />
    </MapView>
  )
}
