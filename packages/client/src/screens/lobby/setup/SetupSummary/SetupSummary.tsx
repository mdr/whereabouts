import { useEffect, useRef } from "preact/hooks"
import { mixTotal, type GameView } from "@whereabouts/shared/protocol"
import { QUESTION_TYPES } from "@whereabouts/shared/questions"
import { MapDetailSummary } from "../../../../ui/setup/MapDetailSummary/MapDetailSummary"
import { RoundStrip } from "../../../../ui/setup/RoundStrip/RoundStrip"
import { describeMix } from "../../../../ui/setup/describe-mix"
import { cx } from "../../../../ui/cx"
import { setupSummaryTestIds } from "./SetupSummaryTestIds"
import s from "./SetupSummary.module.css"

/**
 * What a guest sees of the setup: the decided values as tiles. A tile whose
 * value just changed is remounted (it is keyed on the value) with a class
 * that plays a short highlight; nothing flashes on first load.
 */
export function SetupSummary({ view }: { view: GameView }) {
  const { roundLength, mix, mapDetail, hints } = view.config
  const rounds = mixTotal(mix)
  const shown = useRef(view.config)
  const before = shown.current
  useEffect(() => {
    shown.current = view.config
  })
  const mixChanged = QUESTION_TYPES.some((t) => mix[t] !== before.mix[t])
  const tiles = [
    {
      key: "rounds",
      testId: setupSummaryTestIds.rounds,
      value: String(rounds),
      label: rounds === 1 ? "round" : "rounds",
      changed: rounds !== mixTotal(before.mix)
    },
    {
      key: "seconds",
      testId: setupSummaryTestIds.seconds,
      value: `${roundLength / 1000} s`,
      label: "per round",
      changed: roundLength !== before.roundLength
    },
    {
      key: "hints",
      testId: setupSummaryTestIds.hints,
      value: String(hints),
      label: hints === 1 ? "hint each" : "hints each",
      changed: hints !== before.hints
    }
  ]
  return (
    <div class={s.summary} data-testid={setupSummaryTestIds.summary}>
      {tiles.map((t) => (
        <div key={`${t.key}:${t.value}`} class={cx(s.tile, t.changed && s.changed)} data-testid={t.testId}>
          <span class={s.value} data-testid={setupSummaryTestIds.tileValue}>
            {t.value}
          </span>
          <span class={s.label}>{t.label}</span>
        </div>
      ))}
      <div
        key={`questions:${describeMix(mix)}`}
        class={cx(s.tile, s.questions, mixChanged && s.changed)}
        data-testid={setupSummaryTestIds.questions}
      >
        <span class={s.label}>{describeMix(mix)}</span>
        <RoundStrip mix={mix} total={false} centred />
      </div>
      <div
        key={`map:${mapDetail}`}
        class={cx(s.tile, s.mapDetail, mapDetail !== before.mapDetail && s.changed)}
        data-testid={setupSummaryTestIds.mapDetail}
      >
        <MapDetailSummary value={mapDetail} />
      </div>
    </div>
  )
}
