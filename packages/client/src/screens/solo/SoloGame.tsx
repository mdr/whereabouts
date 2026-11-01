import { useEffect, useMemo, useState } from "preact/hooks"
import { useSignal } from "@preact/signals"
import { buildDistribution, kernelById } from "@whereabouts/shared/scoring/scoring"
import { hintBand, type HintAxis, type HintBand } from "@whereabouts/shared/hints"
import { questionPictures, questionView } from "@whereabouts/shared/game/game-views"
import { scoreAnswer, scoredAnswer } from "@whereabouts/shared/scoring/regions"
import { QuestionType, answerCentre, type Outlines, type Question } from "@whereabouts/shared/questions"
import type { LatLon } from "@whereabouts/shared/geo"
import { onWater } from "@whereabouts/shared/protocol"
import { usePaint } from "../../ui/map/MapView/MapView"
import { formatPoints } from "../../ui/format"
import { forTabbedControl } from "../../keyboard/keys"
import { SUBMIT } from "../../keyboard/shortcuts"
import { HeaderNote, Hud, HudBottom, HudHeader, HudTop } from "../../ui/map/Hud/Hud"
import { DoneButton } from "../../ui/round/DoneButton"
import { RevealCards } from "../../ui/round/RevealCards"
import { RoundPrompt } from "../../ui/round/RoundPrompt/RoundPrompt"
import { PaintDev } from "../../ui/map/paint/PaintDev/PaintDev"
import { PaintTools } from "../../ui/map/paint/PaintTools/PaintTools"
import { VrButton, useVrView } from "../../ui/VrButton/VrButton"
import { practiceVrView } from "../../vr/view/practice-vr-view"
import { DevDrawer } from "../../ui/dev/DevDrawer/DevDrawer"
import { allFlags, cheatLiveScore, soloKernelId, soloMapDetail } from "../../settings/settings"
import { devMode } from "../../ui/dev/dev"
import { Icon } from "../../ui/icons"
import { useBorders } from "../../data/borders"
import { useFact } from "../../data/facts"
import { preloadPictures } from "../../data/preload"
import { HintCard } from "../../ui/round/Hint/Hint"
import { AllFlags } from "../../ui/round/flag-reveal/AllFlags/AllFlags"
import { AllFlagsSwitch } from "../../ui/round/flag-reveal/AllFlagsSwitch/AllFlagsSwitch"
import { FlagHover } from "../../ui/round/flag-reveal/FlagHover/FlagHover"
import { mainCountry } from "../../ui/round/flag-reveal/main-country"
import { announcePass, frameReveal, showAnswer, useRoundMap } from "../../round/round"
import {
  PracticePhase,
  currentQuestion,
  isLastRound,
  nextLabel,
  nextRound,
  revealedFromQuestion,
  runTotal,
  startRun,
  submitRound,
  type PracticeRun
} from "../../round/practice-run"
import { soloTestIds } from "./Solo/SoloTestIds"
import { Cheats } from "./Cheats"
import { LiveScore } from "./LiveScore/LiveScore"
import { RevealScore } from "./RevealScore/RevealScore"
import { SoloDone } from "./SoloDone"

export function SoloGame({ pool, outlines }: { pool: Question[]; outlines: Outlines }) {
  const paint = usePaint()
  const [run, setRun] = useState<PracticeRun>(() => startRun(pool, Date.now()))
  const { questions, index } = run
  const phase = run.type
  const revealed = run.type === PracticePhase.REVEAL ? run.revealed : undefined
  const hover = useSignal<LatLon | undefined>(undefined)
  // Practice hints are unlimited, still one per question.
  const [hint, setHint] = useState<HintBand | undefined>(undefined)
  const fullQuestion = currentQuestion(run)
  const kernel = kernelById(soloKernelId.value)
  const total = runTotal(run)
  const cheating = devMode.value && cheatLiveScore.value
  const question = questionView(fullQuestion)
  const answer = revealedFromQuestion(fullQuestion, outlines)
  const scored = useMemo(() => scoredAnswer(fullQuestion.answer, outlines), [fullQuestion])
  const detail = soloMapDetail.value

  useRoundMap(paint, {
    round: index,
    painting: phase === PracticePhase.PAINT,
    question,
    detail,
    reveal: phase === PracticePhase.REVEAL,
    hint,
    start: () => (paint.enabled.value = true)
  })

  // Cheat: show the answer while painting.
  useEffect(() => {
    if (phase !== PracticePhase.PAINT) return
    if (cheating) showAnswer(paint.gameMap, answer)
    else paint.gameMap.clearReveal()
  }, [cheating, phase, index])

  useEffect(() => paint.onHover((point) => (hover.value = point)), [paint])

  useEffect(() => setHint(undefined), [index, questions])

  useEffect(() => {
    const next = questions[index + 1]
    if (next) preloadPictures(questionPictures(next))
  }, [questions, index])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!SUBMIT.matches(event) || event.repeat || forTabbedControl(event)) return
      // A photo or the shortcuts list open over the round has the keyboard.
      if (document.querySelector('[role="dialog"]')) return
      const act =
        phase === PracticePhase.PAINT && !paint.layer.isEmpty
          ? submit
          : phase === PracticePhase.REVEAL
            ? next
            : undefined
      if (!act) return
      // A clicked button keeps focus, and Enter would press it as well.
      event.preventDefault()
      act()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  // With nothing painted, a pass: it scores PASS_SCORE, as in a game.
  function submit() {
    if (run.type !== PracticePhase.PAINT) return
    const passed = announcePass(paint)
    const painted = passed ? undefined : buildDistribution(paint.layer.toCells(), paint.floor.value)
    setRun(submitRound(run, painted, scored, kernel))
    paint.enabled.value = false
    showAnswer(paint.gameMap, answer)
  }

  // Framed after the reveal's cards are in place: on a phone the map frames the answer around them.
  useEffect(() => {
    if (phase === PracticePhase.REVEAL) frameReveal(paint.gameMap, question, answer, paint.layer.toGeoJSON())
  }, [phase, index])

  function next() {
    if (run.type !== PracticePhase.REVEAL) return
    if (isLastRound(run)) paint.gameMap.clearReveal()
    setRun(nextRound(run))
  }

  const restart = () => setRun(startRun(pool, Date.now()))

  const useHint = (axis: HintAxis) =>
    setHint(hintBand(answerCentre(fullQuestion.answer), fullQuestion.answer.tolerance, axis, Math.random()))
  // A flag round's reveal names the country under the pointer, and where the
  // paint mostly was. Loaded while the flag is still being painted.
  const borders = useBorders(fullQuestion.type === QuestionType.FLAG)
  // Each practice run shuffles anew, so its first question picks this run's facts.
  const fact = useFact(fullQuestion, questions[0]!.id, index)
  // Re-score the revealed paint if the kernel changes on the reveal screen.
  const shownResult = useMemo(() => scoreAnswer(revealed?.painted, scored, kernel), [revealed, kernel.id])
  const where = useMemo(
    () => (revealed && borders ? mainCountry(borders, paint.layer.toCells()) : undefined),
    [revealed, borders]
  )
  const vrView = practiceVrView(run, {
    paint,
    question,
    answer,
    fact,
    detail,
    hint,
    useHint,
    submit,
    next,
    restart,
    shownScore: shownResult.score,
    where,
    borders
  })
  useVrView(vrView)

  const header = (
    <HudHeader
      home
      round={Math.min(index + 1, questions.length)}
      total={questions.length}
      right={<HeaderNote nowrap>{formatPoints(total)}</HeaderNote>}
    />
  )

  if (phase === PracticePhase.DONE) return <SoloDone run={run} restart={restart} vrView={vrView} />

  if (run.type === PracticePhase.REVEAL) {
    const painted = run.revealed.painted
    const last = isLastRound(run)
    return (
      <>
        {borders && <FlagHover gameMap={paint.gameMap} borders={borders} />}
        {borders && allFlags.value && <AllFlags gameMap={paint.gameMap} borders={borders} />}
        <Hud reveal>
          <HudTop>
            {header}
            <RevealCards
              question={question}
              revealed={answer}
              fact={fact}
              you={{ score: shownResult.score, passed: !painted }}
              playedLabel="your score this round"
              where={where}
              testIds={{ score: soloTestIds.roundScore }}
            />
          </HudTop>
          <HudBottom>
            {fullQuestion.type === QuestionType.FLAG && <AllFlagsSwitch />}
            <VrButton view={vrView} />
            <button class="primary" onClick={next} data-testid={soloTestIds.nextButton}>
              <Icon name={last ? "flag" : "next"} /> {nextLabel(run)} <kbd>Enter</kbd>
            </button>
          </HudBottom>
        </Hud>
        <DevDrawer>
          <RevealScore answer={scored} kernel={kernel} parts={shownResult.parts} painted={painted} hover={hover} />
          <Cheats question={fullQuestion} answer={scored} kernel={kernel} />
          <PaintDev />
        </DevDrawer>
      </>
    )
  }

  return (
    <>
      <Hud>
        <HudTop>
          {header}
          <RoundPrompt question={question} />
          <HintCard band={hint} onUse={useHint} />
        </HudTop>
        <PaintTools practice water={onWater(question.answer)} hint={hint} canPass>
          <VrButton view={vrView} />
          <DoneButton label="Submit" onDone={submit} testId={soloTestIds.submitButton} />
        </PaintTools>
      </Hud>
      <DevDrawer>
        <Cheats question={fullQuestion} answer={scored} kernel={kernel} />
        {cheating && <LiveScore question={fullQuestion} answer={scored} kernelId={kernel.id} />}
        <PaintDev />
      </DevDrawer>
    </>
  )
}
