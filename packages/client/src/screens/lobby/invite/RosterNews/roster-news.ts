import type { PlayerId, PlayerName } from "@whereabouts/shared/ids"

/** What the lobby's news needs of each person in the game. */
export interface Seat {
  id: PlayerId
  name: PlayerName
  isHost: boolean
}

const listed = (names: string[]): string =>
  names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} and ${names.at(-1)!}`

/** Who joined, who left and who hosts now, between two looks at the room; undefined if nothing did. `you` never hear of themselves joining. */
export const rosterNews = (before: Seat[], after: Seat[], you: PlayerId): string | undefined => {
  const had = new Set(before.map((seat) => seat.id))
  const has = new Set(after.map((seat) => seat.id))
  const joined = after.filter((seat) => !had.has(seat.id) && seat.id !== you).map((seat) => seat.name)
  const left = before.filter((seat) => !has.has(seat.id)).map((seat) => seat.name)
  const hostBefore = before.find((seat) => seat.isHost)
  const hostAfter = after.find((seat) => seat.isHost)
  const sentences = [
    ...(joined.length > 0 ? [`${listed(joined)} joined.`] : []),
    ...(left.length > 0 ? [`${listed(left)} left.`] : []),
    ...(hostAfter && hostAfter.id !== hostBefore?.id
      ? [hostAfter.id === you ? "You're the host now." : `${hostAfter.name} is now the host.`]
      : [])
  ]
  return sentences.length > 0 ? sentences.join(" ") : undefined
}
