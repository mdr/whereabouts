import { useEffect, useMemo } from "preact/hooks"
import { useSignal } from "@preact/signals"
import type { LatLon } from "@whereabouts/shared/geo"
import { Phase, RoundGuessType, type GameView } from "@whereabouts/shared/protocol/views"
import { buildDistribution, kernelById } from "@whereabouts/shared/scoring/scoring"
import { scoreAnswer, scoredAnswer } from "@whereabouts/shared/scoring/regions"
import { PracticeGameService } from "../../../game-service/practice-game-service"
import { useGameService } from "../../../game-service/use-game-service"
import { paintLayer } from "../../../round/reveal-paint"
import { revealedFromQuestion } from "../../../round/revealed-from-question"
import { showAnswer } from "../../../round/round"
import { cheatLiveScore, soloKernelId } from "../../../settings/settings"
import { usePaint } from "../../../ui/map/MapView/MapView"
import { Cheats } from "../Cheats"
import { LiveScore } from "../LiveScore/LiveScore"
import { RevealScore } from "../RevealScore/RevealScore"

/**
 * Practice's playtest tools for the dev drawer, which need the full question: the answer and a live score
 * while painting, the revealed paint scored under any kernel, and a test case to copy. Nothing online.
 */
export const PracticeDev = ({ view }: { view: GameView }) => {
  const game = useGameService()
  const practice = game instanceof PracticeGameService ? game : undefined
  const paint = usePaint()
  const hover = useSignal<LatLon | undefined>(undefined)
  const question = practice?.question.value
  const kernel = kernelById(soloKernelId.value)
  const scored = useMemo(() => (question ? scoredAnswer(question.answer, practice.outlines) : undefined), [question])
  const cheating = cheatLiveScore.value
  const guessing = view.phase === Phase.GUESSING

  useEffect(() => {
    if (!guessing || !cheating || !question) return
    showAnswer(paint.gameMap, revealedFromQuestion(question, practice.outlines))
    return () => paint.gameMap.clearReveal()
  }, [guessing, cheating, question])

  useEffect(() => paint.onHover((point) => (hover.value = point)), [paint])

  // The revealed paint again, to score under the kernel chosen now.
  const guess =
    view.phase === Phase.REVEAL ? view.reveal.results.find((r) => r.playerId === view.you.id)?.guess : undefined
  const painted = useMemo(
    () =>
      guess?.type === RoundGuessType.PAINTED
        ? buildDistribution(paintLayer(guess.resolution, guess.paint).toCells(), guess.paint.floor)
        : undefined,
    [guess]
  )
  const rescored = useMemo(
    () => (guess && scored ? scoreAnswer(painted, scored, kernel) : undefined),
    [guess, scored, painted, kernel.id]
  )

  if (!question || !scored) return undefined
  return (
    <>
      {rescored && (
        <RevealScore answer={scored} kernel={kernel} parts={rescored.parts} painted={painted} hover={hover} />
      )}
      <Cheats question={question} answer={scored} kernel={kernel} />
      {guessing && cheating && <LiveScore question={question} answer={scored} kernelId={kernel.id} />}
    </>
  )
}
