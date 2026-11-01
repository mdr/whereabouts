/** Practice's round, reveal and final score as the headset shows them. */
import type { Borders, PaintedCountry } from "@whereabouts/shared/borders"
import type { Fact } from "@whereabouts/shared/catalogue/facts"
import type { HintAxis, HintBand } from "@whereabouts/shared/hints"
import type { MapDetail } from "@whereabouts/shared/protocol/config"
import type { QuestionView } from "@whereabouts/shared/protocol/views"
import type { PaintController } from "../../paint/paint-controller"
import { navigate } from "../../router"
import type { RevealedAnswer } from "../../round/round"
import { PracticePhase, nextLabel, roundsTable, runMaximum, runTotal, type PracticeRun } from "../../round/practice-run"
import { formatPoints } from "../../ui/format"
import { vrReveal, vrRound, type VrRoundShown } from "./vr-round"
import { HintAllowance, VrPaintsType, VrViewType, type VrView } from "./view"

export interface PracticeVrShown {
  paint: PaintController
  question: QuestionView
  answer: RevealedAnswer
  fact: Fact | undefined
  detail: MapDetail
  hint: HintBand | undefined
  useHint: (axis: HintAxis) => void
  submit: () => void
  next: () => void
  restart: () => void
  /** The revealed round's score under the kernel chosen now, which may differ from when it was submitted. */
  shownScore: number
  where: PaintedCountry | undefined
  borders: Borders | undefined
}

export function practiceVrView(run: PracticeRun, pageShown: PracticeVrShown): VrView {
  const total = runTotal(run)
  const home = { label: "Home", press: () => navigate("/") }
  if (run.type === PracticePhase.DONE)
    return {
      type: VrViewType.DONE,
      summary: {
        title: "Final score",
        scoreLine: `${formatPoints(total)} out of ${runMaximum(run).toLocaleString()}`,
        table: roundsTable(run.results),
        actions: [{ label: "Play again", press: pageShown.restart }]
      },
      more: [home]
    }

  const shown: VrRoundShown = {
    question: pageShown.question,
    revealed: run.type === PracticePhase.REVEAL ? pageShown.answer : undefined,
    fact: pageShown.fact
  }
  const round = vrRound(shown, {
    paint: pageShown.paint,
    heading: `QUESTION ${run.index + 1} OF ${run.questions.length}, ${formatPoints(total)}`,
    detail: pageShown.detail,
    hint: pageShown.hint,
    hintsLeft: HintAllowance.UNLIMITED,
    useHint: pageShown.useHint,
    doneLabel: "Submit",
    done: pageShown.submit,
    playing: true
  })
  const more = [{ ...home, confirm: "Press again to leave" }]
  if (run.type !== PracticePhase.REVEAL) return { type: VrViewType.PAINT, round, more }
  return {
    type: VrViewType.REVEAL,
    round,
    more,
    reveal: vrReveal(
      shown,
      pageShown.answer,
      { score: pageShown.shownScore, passed: !run.revealed.painted, total, painted: pageShown.where },
      pageShown.borders,
      {
        paints: { type: VrPaintsType.OWN },
        table: roundsTable(run.results),
        actions: [{ label: nextLabel(run), press: pageShown.next }]
      }
    )
  }
}
