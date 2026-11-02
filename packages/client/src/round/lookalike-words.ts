/** What the page and the headset say of a flag round's look-alikes. */
import { CATALOGUE, isFlagQuestion } from "@whereabouts/shared/catalogue/catalogue"
import type { Lookalikes } from "@whereabouts/shared/catalogue/lookalike-flags"
import type { FlagCode } from "@whereabouts/shared/ids"

const LABELS = new Map(CATALOGUE.filter(isFlagQuestion).map((question) => [question.clue.flag, question.label]))

export const flagLabel = (code: FlagCode): string => LABELS.get(code) ?? code

export const lookalikesHeading = (lookalikes: Lookalikes): string =>
  lookalikes.mistaken ? `Easy to mix up: you painted ${flagLabel(lookalikes.mistaken)}` : "Look-alike flags"

/** For the headset, when the paint was mostly in a look-alike: "Poland: White over red. Indonesia: Red over white, and longer." */
export const mixUpText = (lookalikes: Lookalikes): string | undefined => {
  if (!lookalikes.mistaken) return undefined
  const [answer, painted] = lookalikes.flags
  return `${flagLabel(painted!.code)}: ${painted!.tip}. ${flagLabel(answer!.code)}: ${answer!.tip}.`
}
