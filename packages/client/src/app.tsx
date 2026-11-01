import { GameEntryType } from "@whereabouts/shared/protocol"
import { route, RouteType, visit } from "./router"
import { Home } from "./screens/Home/Home"
import { Solo } from "./screens/solo/Solo/Solo"
import { Multiplayer } from "./screens/multiplayer/Multiplayer"
import { ScoreReview } from "./screens/score-review/ScoreReview/ScoreReview"

export function App() {
  const r = route.value
  switch (r.type) {
    case RouteType.SOLO:
      return <Solo />
    case RouteType.SCORE_REVIEW:
      return <ScoreReview />
    case RouteType.GAME:
      return (
        <Multiplayer
          key={`${visit.value}:${r.entry.type === GameEntryType.HOST ? "new" : "join"}:${r.entry.code ?? ""}`}
          entry={r.entry}
        />
      )
    case RouteType.HOME:
      return <Home />
  }
}
