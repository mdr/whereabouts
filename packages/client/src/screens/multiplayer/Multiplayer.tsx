/** Online game: lobby, timed guessing, reveal, results. One Connection per mount. */
import { useEffect, useMemo, useState } from "preact/hooks"
import type { PlayerName, RoomCode } from "@whereabouts/shared/ids"
import { Connection } from "../../net/net"
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

export function Multiplayer({ code, create }: { code: RoomCode | undefined; create: boolean }) {
  const conn = useMemo(() => new Connection(), [])
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
    if (create) return nameToJoin(savedName.value)
    const handed = nameHandoff.value
    nameHandoff.value = undefined
    if (handed) return handed
    // A refresh of a tab that already holds a seat in this game.
    if (code && joinedCode.value === code) return nameToJoin(savedName.value)
    return undefined
  })

  useEffect(() => {
    if (create && !confirmedName) {
      navigate("/")
      return
    }
    if (!confirmedName) return
    askedToWatch.value = watch
    conn.connect(
      create
        ? { token: seatToken(), name: confirmedName, create: true, ...(code ? { code } : {}) }
        : { token: seatToken(), name: confirmedName, code: code ?? undefined, ...(watch ? { watch } : {}) }
    )
    return () => conn.disconnect()
  }, [conn, confirmedName])

  if (!confirmedName) {
    return (
      <JoinAs
        code={code}
        onJoin={(name, asWatcher) => {
          savedName.value = name
          setWatch(asWatcher)
          setConfirmedName(name)
        }}
      />
    )
  }
  return <Joined conn={conn} code={code} create={create} />
}
