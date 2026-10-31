/**
 * Single-player practice mode. Playtest tools live in the dev drawer. It asks
 * the types of question chosen on the front page, from the same pools as a
 * game, in an endless shuffle.
 */
import { useEffect, useMemo, useState } from "preact/hooks"
import { useSignal } from "@preact/signals"
import { buildDistribution, kernelById } from "@whereabouts/shared/scoring"
import { hintBand, type HintAxis, type HintBand } from "@whereabouts/shared/hints"
import { questionPictures, questionView } from "@whereabouts/shared/game-views"
import { scoreAnswer, scoredAnswer } from "@whereabouts/shared/regions"
import { QuestionType, answerCentre, type Outlines, type Question } from "@whereabouts/shared/questions"
import { AREA_TYPES, CATALOGUE, poolOf } from "@whereabouts/shared/catalogue"
import type { LatLon } from "@whereabouts/shared/geo"
import { onWater } from "@whereabouts/shared/protocol"
import { MapView, usePaint } from "../ui/MapView"
import { forTabbedControl } from "../keys"
import { LoadingOutlines } from "../ui/LoadingOutlines"
import { HeaderNote, Hud, HudBottom, HudHeader, HudTop } from "../ui/Hud"
import { DoneButton, RevealCards, RoundPrompt } from "../ui/Round"
import { PaintDev, PaintTools } from "../ui/PaintTools"
import { VrButton, useVrHold, useVrView } from "../ui/VrButton"
import { practiceVrView } from "../practice-vr-view"
import { DevDrawer } from "../ui/DevDrawer"
import { allFlags, cheatLiveScore, soloKernelId, soloMapDetail, soloTypes } from "../settings"
import { devMode } from "../dev"
import { Icon } from "../ui/icons"
import { useOutlines } from "../outlines"
import { useBorders } from "../borders"
import { useFact } from "../facts"
import { preloadPictures } from "../preload"
import { HintCard } from "../ui/Hint"
import { AllFlags, AllFlagsSwitch, FlagHover, mainCountry } from "../ui/FlagReveal"
import { announcePass, frameReveal, showAnswer, useRoundMap } from "../round"
import {
  PracticePhase,
  currentQuestion,
  isLastRound,
  nextLabel,
  nextRound,
  revealedFromQuestion,
  runTotal,
  startRun,
  submitRound
} from "../practice-run"
import { soloTestIds } from "./SoloTestIds"
import { Cheats, LiveScore, RevealScore } from "./SoloDevTools"
import { SoloDone } from "./SoloDone"

export function Solo() {
  useVrHold()
  return (
    <MapView>
      <SoloLoader />
    </MapView>
  )
}

/** The outlines come in their own chunk, fetched when a type painted whole is asked for. */
function SoloLoader() {
  const types = soloTypes.value
  const needed = types.some((t) => AREA_TYPES.includes(t))
  const loaded = useOutlines(needed)
  if (!loaded && needed) return <LoadingOutlines />
  return <SoloGame pool={poolOf(CATALOGUE, types, soloMapDetail.value)} outlines={loaded ?? new Map()} />
}

function SoloGame({ pool, outlines }: { pool: Question[]; outlines: Outlines }) {
  const paint = usePaint()
  const [run, setRun] = useState(() => startRun(pool, Date.now()))
  const { questions, index, phase, revealed } = run
  const hover = useSignal<LatLon | undefined>(undefined)
  // Practice hints are unlimited, still one per question.
  const [hint, setHint] = useState<HintBand | undefined>(undefined)
  const q = currentQuestion(run)
  const kernel = kernelById(soloKernelId.value)
  const total = runTotal(run)
  const cheating = devMode.value && cheatLiveScore.value
  const question = questionView(q)
  const answer = revealedFromQuestion(q, outlines)
  const scored = useMemo(() => scoredAnswer(q.answer, outlines), [q])
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
    if (cheating) showAnswer(paint.gameMap, question, answer)
    else paint.gameMap.clearReveal()
  }, [cheating, phase, index])

  useEffect(() => paint.onHover((p) => (hover.value = p)), [paint])

  useEffect(() => setHint(undefined), [index, questions])

  useEffect(() => {
    const next = questions[index + 1]
    if (next) preloadPictures(questionPictures(next))
  }, [questions, index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat || forTabbedControl(e)) return
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
      e.preventDefault()
      act()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  // With nothing painted, a pass: it scores PASS_SCORE, as in a game.
  function submit() {
    const passed = announcePass(paint)
    const dist = passed ? undefined : buildDistribution(paint.layer.toCells(), paint.floor.value)
    setRun(submitRound(run, dist, scored, kernel))
    paint.enabled.value = false
    showAnswer(paint.gameMap, question, answer)
  }

  // Framed after the reveal's cards are in place: on a phone the map frames the answer around them.
  useEffect(() => {
    if (phase === PracticePhase.REVEAL) frameReveal(paint.gameMap, question, answer, paint.layer.toGeoJSON())
  }, [phase, index])

  function next() {
    if (isLastRound(run)) paint.gameMap.clearReveal()
    setRun(nextRound(run))
  }

  const restart = () => setRun(startRun(pool, Date.now()))

  const useHint = (axis: HintAxis) => setHint(hintBand(answerCentre(q.answer), q.answer.tolerance, axis, Math.random()))
  // A flag round's reveal names the country under the pointer, and where the
  // paint mostly was. Loaded while the flag is still being painted.
  const borders = useBorders(q.type === QuestionType.FLAG)
  // Each practice run shuffles anew, so its first question picks this run's facts.
  const fact = useFact(q, questions[0]!.id, index)
  // Re-score the revealed paint if the kernel changes on the reveal screen.
  const shownResult = useMemo(() => {
    if (!revealed) return undefined
    return scoreAnswer(revealed.dist, scored, kernel)
  }, [revealed, kernel.id])
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
    shownScore: shownResult?.score,
    where,
    borders
  })
  useVrView(vrView)

  const header = (
    <HudHeader
      home
      round={Math.min(index + 1, questions.length)}
      total={questions.length}
      right={<HeaderNote nowrap>{Math.round(total).toLocaleString()} pts</HeaderNote>}
    />
  )

  if (phase === PracticePhase.DONE) return <SoloDone run={run} restart={restart} vrView={vrView} />

  if (phase === PracticePhase.REVEAL && revealed && shownResult) {
    const dist = revealed.dist
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
              you={{ score: shownResult.score, passed: !dist }}
              playedLabel="your score this round"
              where={where}
              testIds={{ score: soloTestIds.roundScore }}
            />
          </HudTop>
          <HudBottom>
            {q.type === QuestionType.FLAG && <AllFlagsSwitch />}
            <VrButton view={vrView} />
            <button class="primary" onClick={next} data-testid={soloTestIds.nextButton}>
              <Icon name={last ? "flag" : "next"} /> {nextLabel(run)} <kbd>Enter</kbd>
            </button>
          </HudBottom>
        </Hud>
        <DevDrawer>
          <RevealScore a={scored} kernel={kernel} parts={shownResult.parts} dist={dist} hover={hover} />
          <Cheats q={q} a={scored} kernel={kernel} />
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
        <PaintTools practice water={onWater(question.answer)} hint={hint}>
          <VrButton view={vrView} />
          <DoneButton label="Submit" onDone={submit} testId={soloTestIds.submitButton} />
        </PaintTools>
      </Hud>
      <DevDrawer>
        <Cheats q={q} a={scored} kernel={kernel} />
        {cheating && <LiveScore q={q} a={scored} kernelId={kernel.id} />}
        <PaintDev />
      </DevDrawer>
    </>
  )
}
