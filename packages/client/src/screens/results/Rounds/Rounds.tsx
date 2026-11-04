import { useEffect, useState } from "preact/hooks"
import type { Px } from "@whereabouts/shared/units"
import { cx } from "../../../ui/cx"
import { useElementRef } from "../../../ui/element-ref"
import { bestScores, roundsFit } from "../results-table"
import { RoundList, type RoundListProps } from "../RoundList/RoundList"
import { roundsTestIds } from "./RoundsTestIds"
import { ScoreTable } from "../ScoreTable/ScoreTable"
import styles from "./Rounds.module.css"

/**
 * What each round asked and how it went: the full table of everyone's
 * scores where it fits, else a line per round with its winner and your
 * score, and a button for the full table.
 */
export const Rounds = (props: Omit<RoundListProps, "best">) => {
  const { rounds, standings } = props
  const ref = useElementRef<HTMLElement>()
  const [width, setWidth] = useState<Px | undefined>(undefined)
  const [everyone, setEveryone] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  if (rounds.length === 0) return undefined
  const fits = roundsFit(width, standings.length)
  const best = bestScores(rounds.length, standings)
  return (
    <section class={styles.rounds} aria-label="Scores by round" ref={ref}>
      <h2>Rounds</h2>
      {fits || everyone ? <ScoreTable {...props} best={best} scrolls={!fits} /> : <RoundList {...props} best={best} />}
      {!fits && (
        <button
          type="button"
          class={cx("small", styles.everyoneToggle)}
          onClick={() => setEveryone(!everyone)}
          data-testid={roundsTestIds.everyoneToggle}
        >
          {everyone ? "Just the winners" : `Everyone's scores (${standings.length})`}
        </button>
      )}
    </section>
  )
}
