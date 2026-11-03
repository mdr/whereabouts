/** Online game: lobby, timed guessing, reveal, results. One OnlineGameService per mount. */
import { useEffect, useMemo, useState } from "preact/hooks"
import type { PlayerName } from "@whereabouts/shared/ids"
import { GameEntryType, type GameEntry } from "@whereabouts/shared/protocol/ticket"
import { Role } from "@whereabouts/shared/roles"
import { OnlineGameService } from "../../game-service/online-game-service"
import { ConnectionStatus } from "../../game-service/connection-state"
import { GameServiceProvider } from "../../game-service/use-game-service"
import {
  askedToWatch,
  joinedCode,
  nameHandoff,
  nameToJoin,
  savedName,
  seatToken,
  watchHandoff
} from "../../settings/settings"
import { navigate } from "../../router"
import { JoinAs } from "./JoinAs/JoinAs"
import { Joined } from "./Joined/Joined"

export const Multiplayer = ({ entry }: { entry: GameEntry }) => {
  const game = useMemo(() => new OnlineGameService(), [])
  // "Just watch" from the home screen or the join screen below.
  const [watch, setWatch] = useState(() => {
    const handed = watchHandoff.value
    watchHandoff.value = false
    return handed
  })
  // Hosts and code-joiners have just typed their name on the home screen;
  // anyone arriving by link confirms or edits theirs first, so two tabs need
  // not share a name.
  const [confirmedName, setConfirmedName] = useState<PlayerName | undefined>(() => {
    if (entry.type === GameEntryType.HOST) return nameToJoin(savedName.value)
    const handed = nameHandoff.value
    nameHandoff.value = undefined
    if (handed) return handed
    // A refresh of a tab that already holds a seat in this game.
    if (joinedCode.value === entry.code) return nameToJoin(savedName.value)
    return undefined
  })

  useEffect(() => {
    window.testHooks.connection = { connected: () => game.status.peek().type === ConnectionStatus.CONNECTED }
    return () => {
      window.testHooks.connection = undefined
    }
  }, [game])

  useEffect(() => {
    if (entry.type === GameEntryType.HOST && !confirmedName) {
      navigate("/")
      return
    }
    if (!confirmedName) return
    askedToWatch.value = watch
    game.connect({
      token: seatToken(),
      name: confirmedName,
      entry: entry.type === GameEntryType.HOST ? entry : { ...entry, role: watch ? Role.SPECTATOR : Role.PLAYER }
    })
    return () => game.disconnect()
  }, [game, confirmedName])

  if (!confirmedName) {
    // A host without a name has been sent home by the effect above.
    if (entry.type === GameEntryType.HOST) return undefined
    return (
      <JoinAs
        code={entry.code}
        onJoin={(name, asWatcher) => {
          savedName.value = name
          setWatch(asWatcher)
          setConfirmedName(name)
        }}
      />
    )
  }
  return (
    <GameServiceProvider value={game}>
      <Joined entry={entry} />
    </GameServiceProvider>
  )
}
