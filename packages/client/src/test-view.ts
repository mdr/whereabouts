import { playerId, roomCode } from "@whereabouts/shared/ids"
import type { GameView } from "@whereabouts/shared/protocol"

type ViewOverrides = Partial<Omit<GameView, "you">> & { you?: Partial<GameView["you"]> }

/** A lobby view of one player, with whatever a test needs changed. */
export function makeView({ you, ...over }: ViewOverrides = {}): GameView {
  return {
    code: roomCode("AB12"),
    phase: "lobby",
    config: {
      rounds: 5,
      roundMs: 60_000,
      mix: { landmarks: 5, places: 0, countries: 0, flags: 0, features: 0, states: 0 },
      mapDetail: "minimal",
      kernelId: "multi-equal",
      hints: 0
    },
    serverTime: 0,
    you: { id: playerId("p1"), isHost: true, spectating: false, watching: false, locked: false, hintsLeft: 0, ...you },
    players: [],
    ...over
  }
}
