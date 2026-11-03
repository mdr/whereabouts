import { createContext } from "preact"
import { useContext } from "preact/hooks"
import type { GameService } from "./game-service"

const GameServiceContext = createContext<GameService | undefined>(undefined)

export const GameServiceProvider = GameServiceContext.Provider

export const useGameService = (): GameService => {
  const service = useContext(GameServiceContext)
  if (!service) throw new Error("useGameService is only for screens inside a game")
  return service
}
