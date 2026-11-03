import { h, type ComponentChildren, type FunctionComponent } from "preact"
import type { GameService } from "./game-service"
import { GameServiceProvider } from "./use-game-service"

/** For testing-library's `wrapper` option: renders the component inside a game. */
export const inGame =
  (game: GameService): FunctionComponent<{ children?: ComponentChildren }> =>
  ({ children }) =>
    h(GameServiceProvider, { value: game }, children)
