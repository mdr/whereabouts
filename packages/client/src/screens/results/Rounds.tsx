import { useEffect, useState } from "preact/hooks"
import type { Px } from "@whereabouts/shared/units"
import { cx } from "../../ui/cx"
import { useElementRef } from "../../ui/element-ref"
import { RoundList, type RoundListProps } from "./RoundList"
import { roundsTestIds } from "./RoundsTestIds"
import { ScoreTable } from "./ScoreTable"
import s from "./Rounds.module.css"

/** The room the full table needs: the round column, then one column per player. */
const ROUND_COLUMN: Px = 200
const SCORE_COLUMN: Px = 58

/**
 * What each round asked and how it went: the full table of everyone's
 * scores where it fits, else a line per round with its winner and your
 * score, and a button for the full table.
 */
export function Rounds(props: Omit<RoundListProps, "best">) {
  const { rounds, standings } = props
  const ref = useElementRef<HTMLElement>()
  const [width, setWidth] = useState<Px | undefined>(undefined)
  const [everyone, setEveryone] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  if (rounds.length === 0) return undefined
  const fits = width === undefined ? standings.length <= 6 : width >= ROUND_COLUMN + standings.length * SCORE_COLUMN
  const best = rounds.map((_, r) => Math.max(-1, ...standings.map((s) => s.rounds[r]?.score ?? -1)))
  return (
    <section class={s.rounds} aria-label="Scores by round" ref={ref}>
      <h2>Rounds</h2>
      {fits || everyone ? <ScoreTable {...props} best={best} scrolls={!fits} /> : <RoundList {...props} best={best} />}
      {!fits && (
        <button
          type="button"
          class={cx("small", s.everyoneToggle)}
          onClick={() => setEveryone(!everyone)}
          data-testid={roundsTestIds.everyoneToggle}
        >
          {everyone ? "Just the winners" : `Everyone's scores (${standings.length})`}
        </button>
      )}
    </section>
  )
}
