import { route } from "./router"
import { Home } from "./screens/Home"
import { Solo } from "./screens/Solo"
import { Multiplayer } from "./screens/Multiplayer"

export function App() {
  const r = route.value
  switch (r.name) {
    case "solo":
      return <Solo />
    case "game":
      return <Multiplayer key={`${r.create ? "new" : "join"}:${r.code ?? ""}`} code={r.code} create={r.create} />
    default:
      return <Home />
  }
}
