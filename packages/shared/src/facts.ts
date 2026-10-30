/**
 * A line of interest for the reveal: what makes the answer notable, a piece
 * of trivia, or on a flag round something about the flag. facts.json holds
 * three or four for each answer, by its Wikipedia article, each researched
 * and then checked against its source and a second one.
 */

type FactKind = "fame" | "trivia" | "flag"

export interface Fact {
  kind: FactKind
  text: string
  source: string
}

/** By Wikipedia article title, as questions name their answers. */
export type Facts = Record<string, Fact[]>

/**
 * One of an answer's facts. The same `seed` and `round` give the same fact,
 * so every player in a game sees the same one. Rounds alternate between
 * what makes a place notable and trivia; a flag round tells of its flag.
 */
export function pickFact(facts: readonly Fact[] | undefined, seed: string, round: number): Fact | undefined {
  if (!facts?.length) return undefined
  const wanted: FactKind = facts.some((f) => f.kind === "flag") ? "flag" : round % 2 === 0 ? "fame" : "trivia"
  const choice = facts.filter((f) => f.kind === wanted)
  const from = choice.length > 0 ? choice : facts
  return from[hash(`${seed} ${round}`) % from.length]
}

/** FNV-1a: a spread of picks from similar seeds. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return h >>> 0
}
