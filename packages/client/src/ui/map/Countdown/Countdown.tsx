import { useEffect, useState } from "preact/hooks"
import type { Ms, Seconds } from "@whereabouts/shared/units"
import { cx } from "../../cx"
import { countdownTestIds } from "./CountdownTestIds"
import styles from "./Countdown.module.css"

/** Ticks once a second; returns whole seconds remaining, never negative. */
function useCountdown(timeLeft: () => Ms): Seconds {
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [])
  return Math.max(0, Math.ceil(timeLeft() / 1000))
}

/** The seconds left in a round, for the HUD's header. */
export function Countdown({ timeLeft, warnAt = 10 }: { timeLeft: () => Ms; warnAt?: Seconds }) {
  const left = useCountdown(timeLeft)
  return (
    <div class={cx(styles.countdown, left <= warnAt && styles.warn)} data-testid={countdownTestIds.countdown}>
      {left}
    </div>
  )
}
