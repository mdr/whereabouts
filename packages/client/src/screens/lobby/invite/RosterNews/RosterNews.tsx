import { useEffect, useRef, useState } from "preact/hooks"
import { everyone } from "@whereabouts/shared/roles"
import type { GameView } from "@whereabouts/shared/protocol/views"
import type { Ms } from "@whereabouts/shared/units"
import { rosterNews, type Seat } from "./roster-news"
import { rosterNewsTestIds } from "./RosterNewsTestIds"

/** Changes this close together are told as one: a burst of joins is one sentence. */
const BATCH: Ms = 1_000

/** Tells a screen reader, unseen, who joins and leaves the lobby and who takes over hosting. */
export const RosterNews = ({ view }: { view: GameView }) => {
  const seats: Seat[] = everyone(view)
  const latest = useRef(seats)
  latest.current = seats
  const told = useRef(seats)
  const [news, setNews] = useState({ text: "", count: 0 })
  const shape = seats.map((seat) => `${seat.id}:${seat.isHost}`).join()
  useEffect(() => {
    const timer = setTimeout(() => {
      const text = rosterNews(told.current, latest.current, view.you.id)
      told.current = latest.current
      if (text) setNews(({ count }) => ({ text, count: count + 1 }))
    }, BATCH)
    return () => clearTimeout(timer)
  }, [shape, view.you.id])
  return (
    <p class="sr-only" role="status" data-testid={rosterNewsTestIds.news}>
      {/* A new node each time, so the same news twice (Bob left, rejoined, left) is told twice. */}
      <span key={news.count}>{news.text}</span>
    </p>
  )
}
