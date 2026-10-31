/**
 * A line of interest for each answer at the reveal (facts.json): its own
 * chunk, fetched when a round starts and kept from then on.
 */
import { signal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import { AnswerFactsSchema, pickFact, type Fact } from "@whereabouts/shared/facts"
import type { WikiTitle } from "@whereabouts/shared/ids"

type RawFacts = Readonly<Record<string, unknown>>

const facts = signal<RawFacts | undefined>(undefined)

let loading: Promise<RawFacts> | undefined = undefined

function loadFacts(): Promise<RawFacts> {
  loading ??= import("@whereabouts/shared/facts.json").then(
    (m) => (facts.value = m.default),
    (err: unknown) => {
      // Let the next caller try again, after a dropped connection say.
      loading = undefined
      throw err
    }
  )
  return loading
}

const checked = new Map<string, Fact[] | undefined>()

/**
 * The facts for `wiki`, checked on first use. Only these few are parsed:
 * parsing the whole file as a round starts stalls the page.
 */
export function factsOf(all: RawFacts, wiki: WikiTitle): Fact[] | undefined {
  if (checked.has(wiki)) return checked.get(wiki)
  const raw = all[wiki]
  const parsed = raw === undefined ? undefined : AnswerFactsSchema.safeParse(raw)
  if (parsed?.success === false) console.warn(`facts for ${wiki} are malformed`, parsed.error)
  const result = parsed?.success ? parsed.data : undefined
  checked.set(wiki, result)
  return result
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
  return wiki === undefined || !all ? undefined : pickFact(factsOf(all, wiki), seed, round)
}
