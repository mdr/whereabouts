import kit from "./kit.module.css"

/** Score, A and B in the dev drawer. */
export function ScoreParts({ A, B }: { A: number; B: number }) {
  return (
    <div class={kit.parts}>
      <span>
        A <b>{A.toFixed(3)}</b>
      </span>
      <span>
        B <b>{B.toFixed(3)}</b>
      </span>
      <span>
        2A−B <b>{(2 * A - B).toFixed(3)}</b>
      </span>
    </div>
  )
}
