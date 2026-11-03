import type { GameViewIn } from "@whereabouts/shared/game/view-in"
import { type Phase, type QuestionView, type RoundResultView } from "@whereabouts/shared/protocol/views"
import type { Points } from "@whereabouts/shared/units"
import type { TestPlayer } from "./test-player.ts"

/** A round's reveal, read by player. */
export class RevealReading {
  readonly view: GameViewIn<Phase.REVEAL>

  constructor(view: GameViewIn<Phase.REVEAL>) {
    this.view = view
  }

  get label(): string {
    return this.view.reveal.label
  }

  get question(): QuestionView {
    return this.view.reveal.question
  }

  get results(): RoundResultView[] {
    return this.view.reveal.results
  }

  resultOf(player: TestPlayer): RoundResultView {
    const result = this.results.find((candidate) => candidate.name === player.name)
    if (!result) throw new Error(`the reveal has no result for ${player.name}`)
    return result
  }

  scoreOf(player: TestPlayer): Points {
    return this.resultOf(player).score
  }
}
