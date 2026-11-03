import { route, RouteType, visit } from "./router"
import { multiplayerKey } from "./multiplayer-key"
import { Home } from "./screens/Home/Home"
import { Solo } from "./screens/solo/Solo/Solo"
import { Multiplayer } from "./screens/multiplayer/Multiplayer"
import { ScoreReview } from "./screens/score-review/ScoreReview/ScoreReview"

export const App = () => {
  const current = route.value
  switch (current.type) {
    case RouteType.SOLO:
      return <Solo />
    case RouteType.SCORE_REVIEW:
      return <ScoreReview />
    case RouteType.GAME:
      return <Multiplayer key={multiplayerKey(visit.value, current.entry)} entry={current.entry} />
    case RouteType.HOME:
      return <Home />
  }
}
