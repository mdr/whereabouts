/**
 * Flags easily taken for one another (lookalike-flags.json), each with what
 * marks it apart, for a flag round's reveal to coach on.
 */
import { z } from "zod"
import { FlagCodeSchema, SourceUrlSchema, type FlagCode, type SourceUrl } from "../ids.ts"
import lookalikesJson from "../../lookalike-flags.json" with { type: "json" }

export interface LookalikeGroup {
  /** Each flag, with what marks it apart from the rest. */
  flags: ReadonlyMap<FlagCode, string>
  source: SourceUrl
}

const GroupSchema = z.strictObject({ flags: z.record(FlagCodeSchema, z.string()), source: SourceUrlSchema })

export const LOOKALIKE_GROUPS: readonly LookalikeGroup[] = z
  .array(GroupSchema)
  .parse(lookalikesJson)
  .map(({ flags, source }) => ({ flags: new Map(Object.entries(flags) as [FlagCode, string][]), source }))

interface LookalikeFlag {
  code: FlagCode
  tip: string
}

export interface Lookalikes {
  /** The answer's flag first, then the one painted if it is among them, then the rest. */
  flags: LookalikeFlag[]
  /** Where the paint mostly was, when that is a look-alike of the answer. */
  mistaken: FlagCode | undefined
}

/**
 * The answer's look-alikes, from the group that holds where the paint mostly
 * was too, if one does; undefined when its flag has none.
 */
export const lookalikesOf = (
  answer: FlagCode,
  painted: FlagCode | undefined,
  groups: readonly LookalikeGroup[] = LOOKALIKE_GROUPS
): Lookalikes | undefined => {
  const mistaken = painted !== answer ? painted : undefined
  const mixedUp = mistaken && groups.find((group) => group.flags.has(answer) && group.flags.has(mistaken))
  const group = mixedUp ?? groups.find((candidate) => candidate.flags.has(answer))
  if (!group) return undefined
  const first = [answer, ...(mixedUp ? [mistaken] : [])]
  const order = [...first, ...[...group.flags.keys()].filter((code) => !first.includes(code))]
  return {
    flags: order.map((code) => ({ code, tip: group.flags.get(code)! })),
    mistaken: mixedUp ? mistaken : undefined
  }
}
