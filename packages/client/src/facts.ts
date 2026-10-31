/**
 * A line of interest for each answer at the reveal (facts.json): its own
 * chunk, fetched when a round starts and kept from then on.
 */
import { signal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import { pickFact, type Fact, type Facts } from "@whereabouts/shared/facts"
import type { WikiTitle } from "@whereabouts/shared/ids"

const facts = signal<Facts | undefined>(undefined)

let loading: Promise<Facts> | undefined = undefined

function loadFacts(): Promise<Facts> {
  // Not parsed: facts.test.ts checks the file, and parsing it as a round starts stalls the page.
  loading ??= import("@whereabouts/shared/facts.json").then(
    (m) => (facts.value = m.default as unknown as Facts),
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
export function useFact(wiki: WikiTitle | undefined, seed: string, round: number): Fact | undefined {
  const all = facts.value
  useEffect(() => {
    if (!all) loadFacts().catch((err: unknown) => console.warn("could not load the facts", err))
  }, [all])
  return wiki === undefined || !all ? undefined : pickFact(all[wiki], seed, round)
}
