/**
 * Single-player practice mode. Playtest tools live in the dev drawer. It asks
 * the types of question chosen on the front page, from the same pools as a
 * game, in an endless shuffle.
 */
import { useEffect, useMemo, useState } from "preact/hooks"
import { useSignal } from "@preact/signals"
import { buildDistribution, kernelById } from "@whereabouts/shared/scoring/scoring"
import { hintBand, type HintAxis, type HintBand } from "@whereabouts/shared/hints"
import { questionPictures, questionView } from "@whereabouts/shared/game/game-views"
import { scoreAnswer, scoredAnswer } from "@whereabouts/shared/scoring/regions"
import { QuestionType, answerCentre, type Outlines, type Question } from "@whereabouts/shared/questions"
import { AREA_TYPES, CATALOGUE, poolOf } from "@whereabouts/shared/catalogue/catalogue"
import type { LatLon } from "@whereabouts/shared/geo"
import { onWater } from "@whereabouts/shared/protocol"
import { MapView, usePaint } from "../../ui/map/MapView"
import { forTabbedControl } from "../../keyboard/keys"
import { SUBMIT } from "../../keyboard/shortcuts"
import { LoadingOutlines } from "../../ui/map/LoadingOutlines"
import { HeaderNote, Hud, HudBottom, HudHeader, HudTop } from "../../ui/map/Hud"
import { DoneButton, RevealCards, RoundPrompt } from "../../ui/round/Round"
import { PaintDev, PaintTools } from "../../ui/map/PaintTools"
import { VrButton, useVrHold, useVrView } from "../../ui/VrButton"
import { practiceVrView } from "../../vr/view/practice-vr-view"
import { DevDrawer } from "../../ui/dev/DevDrawer"
import { allFlags, cheatLiveScore, soloKernelId, soloMapDetail, soloTypes } from "../../settings/settings"
import { devMode } from "../../ui/dev/dev"
import { Icon } from "../../ui/icons"
import { useOutlines } from "../../data/outlines"
import { useBorders } from "../../data/borders"
import { useFact } from "../../data/facts"
import { preloadPictures } from "../../data/preload"
import { HintCard } from "../../ui/round/Hint"
import { AllFlags, AllFlagsSwitch, FlagHover, mainCountry } from "../../ui/round/FlagReveal"
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
import { SoloGame } from "./SoloGame"

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
