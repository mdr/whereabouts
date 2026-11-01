/** Practice's round, reveal and final score as the headset shows them. */
import type { Borders, PaintedCountry } from "@whereabouts/shared/borders"
import type { Fact } from "@whereabouts/shared/catalogue/facts"
import type { HintAxis, HintBand } from "@whereabouts/shared/hints"
import type { MapDetail, QuestionView } from "@whereabouts/shared/protocol"
import type { PaintController } from "../../paint/paint-controller"
import { navigate } from "../../router"
import type { RevealedAnswer } from "../../round/round"
import { PracticePhase, nextLabel, roundsTable, runMaximum, runTotal, type PracticeRun } from "../../round/practice-run"
import { pts, vrReveal, vrRound, type VrRoundShown } from "./vr-round"
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

export function practiceVrView(run: PracticeRun, s: PracticeVrShown): VrView {
  const total = runTotal(run)
  const home = { label: "Home", press: () => navigate("/") }
  if (run.type === PracticePhase.DONE)
    return {
      type: VrViewType.DONE,
      summary: {
        title: "Final score",
        scoreLine: `${pts(total)} out of ${runMaximum(run).toLocaleString()}`,
        table: roundsTable(run.results),
        actions: [{ label: "Play again", press: s.restart }]
      },
      more: [home]
    }

  const shown: VrRoundShown = {
    question: s.question,
    revealed: run.type === PracticePhase.REVEAL ? s.answer : undefined,
    fact: s.fact
  }
  const round = vrRound(shown, {
    paint: s.paint,
    heading: `QUESTION ${run.index + 1} OF ${run.questions.length}, ${pts(total)}`,
    detail: s.detail,
    hint: s.hint,
    hintsLeft: HintAllowance.UNLIMITED,
    useHint: s.useHint,
    doneLabel: "Submit",
    done: s.submit,
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
      s.answer,
      { score: s.shownScore, passed: !run.revealed.dist, total, painted: s.where },
      s.borders,
      {
        paints: { type: VrPaintsType.OWN },
        table: roundsTable(run.results),
        actions: [{ label: nextLabel(run), press: s.next }]
      }
    )
  }
}
