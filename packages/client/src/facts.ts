/**
 * A line of interest for each answer at the reveal (facts.json): its own
 * chunk, fetched when a round starts and kept from then on.
 */
import { signal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import { pickFact, type Fact, type Facts } from "@whereabouts/shared"

const facts = signal<Facts | undefined>(undefined)

let loading: Promise<Facts> | undefined = undefined

function loadFacts(): Promise<Facts> {
  loading ??= import("@whereabouts/shared/facts.json").then(
    (m) => (facts.value = m.default as Facts),
    (err: unknown) => {
      // Let the next caller try again, after a dropped connection say.
      loading = undefined
      throw err
    }
  )
  return loading
}

/**
 * The fact to show for the answer `wiki`, loading them if need be; the same
 * for everyone with the same `seed` and `round`. Undefined until loaded, or
 * for an answer without facts.
 */
export function useFact(wiki: string | undefined, seed: string, round: number): Fact | undefined {
  const all = facts.value
  useEffect(() => {
    if (!all) loadFacts().catch((err: unknown) => console.warn("could not load the facts", err))
  }, [all])
  return wiki === undefined || !all ? undefined : pickFact(all[wiki], seed, round)
}
