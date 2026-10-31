/**
 * A line of interest for each answer at the reveal (facts.json): its own
 * chunk, fetched when a round starts and kept from then on.
 */
import { signal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import { PlaceFactsSchema, factsFor, pickFact, type Fact, type PlaceFacts } from "@whereabouts/shared/facts"
import type { PlaceId } from "@whereabouts/shared/ids"
import type { QuestionType } from "@whereabouts/shared/questions"

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

const checked = new Map<string, PlaceFacts | undefined>()

/**
 * The facts for `place`, checked on first use. Only these few are parsed:
 * parsing the whole file as a round starts stalls the page.
 */
export function factsOf(all: RawFacts, place: PlaceId): PlaceFacts | undefined {
  if (checked.has(place)) return checked.get(place)
  const raw = all[place]
  const parsed = raw === undefined ? undefined : PlaceFactsSchema.safeParse(raw)
  if (parsed?.success === false) console.warn(`facts for ${place} are malformed`, parsed.error)
  const result = parsed?.success ? parsed.data : undefined
  checked.set(place, result)
  return result
}

/**
 * The fact to show for a round asking `type` about `place`, loading them if
 * need be; the same for everyone with the same `seed` and `round`. Undefined
 * until loaded, or for an answer without facts.
 */
export function useFact(
  question: { place: PlaceId; type: QuestionType } | undefined,
  seed: string,
  round: number
): Fact | undefined {
  const all = facts.value
  useEffect(() => {
    if (!all) loadFacts().catch((err: unknown) => console.warn("could not load the facts", err))
  }, [all])
  return question === undefined || !all
    ? undefined
    : pickFact(factsFor(factsOf(all, question.place), question.type), seed, round)
}
