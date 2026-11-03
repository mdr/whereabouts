import { useEffect, useRef } from "preact/hooks"
import { mixTotal } from "@whereabouts/shared/protocol/config"
import { type GameView } from "@whereabouts/shared/protocol/views"
import { QUESTION_TYPES } from "@whereabouts/shared/questions"
import { MapDetailSummary } from "../../../../ui/setup/MapDetailSummary/MapDetailSummary"
import { RoundStrip } from "../../../../ui/setup/RoundStrip/RoundStrip"
import { describeMix } from "../../../../ui/setup/describe-mix"
import { cx } from "../../../../ui/cx"
import { setupSummaryTestIds } from "./SetupSummaryTestIds"
import styles from "./SetupSummary.module.css"

/**
 * What a guest sees of the setup: the decided values as tiles. A tile whose
 * value just changed is remounted (it is keyed on the value) with a class
 * that plays a short highlight; nothing flashes on first load.
 */
export const SetupSummary = ({ view }: { view: GameView }) => {
  const { roundLength, mix, mapDetail, hints } = view.config
  const rounds = mixTotal(mix)
  const shown = useRef(view.config)
  const before = shown.current
  useEffect(() => {
    shown.current = view.config
  })
  const mixChanged = QUESTION_TYPES.some((type) => mix[type] !== before.mix[type])
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
      value: roundLength === undefined ? "No limit" : `${roundLength / 1000} s`,
      label: "per round",
      changed: roundLength !== before.roundLength
    },
    {
      key: "hints",
      testId: setupSummaryTestIds.hints,
      value: hints === undefined ? "Unlimited" : String(hints),
      label: hints === 1 ? "hint each" : "hints each",
      changed: hints !== before.hints
    }
  ]
  return (
    <div class={styles.summary} data-testid={setupSummaryTestIds.summary}>
      {tiles.map((tile) => (
        <div
          key={`${tile.key}:${tile.value}`}
          class={cx(styles.tile, tile.changed && styles.changed)}
          data-testid={tile.testId}
        >
          <span class={styles.value} data-testid={setupSummaryTestIds.tileValue}>
            {tile.value}
          </span>
          <span class={styles.label}>{tile.label}</span>
        </div>
      ))}
      <div
        key={`questions:${describeMix(mix)}`}
        class={cx(styles.tile, styles.questions, mixChanged && styles.changed)}
        data-testid={setupSummaryTestIds.questions}
      >
        <span class={styles.label}>{describeMix(mix)}</span>
        <RoundStrip mix={mix} total={false} centred />
      </div>
      <div
        key={`map:${mapDetail}`}
        class={cx(styles.tile, styles.mapDetail, mapDetail !== before.mapDetail && styles.changed)}
        data-testid={setupSummaryTestIds.mapDetail}
      >
        <MapDetailSummary value={mapDetail} />
      </div>
    </div>
  )
}
