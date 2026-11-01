import { GameEntryType } from "@whereabouts/shared/protocol/ticket"
import { route, RouteType, visit } from "./router"
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
      return (
        <Multiplayer
          key={`${visit.value}:${current.entry.type === GameEntryType.HOST ? "new" : "join"}:${current.entry.code ?? ""}`}
          entry={current.entry}
        />
      )
    case RouteType.HOME:
      return <Home />
  }
}
