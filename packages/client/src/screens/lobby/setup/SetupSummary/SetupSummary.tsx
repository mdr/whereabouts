import { useEffect, useRef } from "preact/hooks"
import { type GameView } from "@whereabouts/shared/protocol/views"
import { MapDetailSummary } from "../../../../ui/setup/MapDetailSummary/MapDetailSummary"
import { RoundStrip } from "../../../../ui/setup/RoundStrip/RoundStrip"
import { describeMix } from "../../../../ui/setup/describe-mix"
import { cx } from "../../../../ui/cx"
import { changedSetup, setupTiles, SetupTileType, type SetupTile } from "../setup-tiles"
import { setupSummaryTestIds } from "./SetupSummaryTestIds"
import styles from "./SetupSummary.module.css"

const TILE_TEST_IDS: Record<SetupTile["type"], string> = {
  [SetupTileType.ROUNDS]: setupSummaryTestIds.rounds,
  [SetupTileType.SECONDS]: setupSummaryTestIds.seconds,
  [SetupTileType.HINTS]: setupSummaryTestIds.hints
}

/**
 * What a guest sees of the setup: the decided values as tiles. A tile whose
 * value just changed is remounted (it is keyed on the value) and marked
 * `data-changed`, which plays a short highlight; nothing flashes on first load.
 */
export const SetupSummary = ({ view }: { view: GameView }) => {
  const { mix, mapDetail } = view.config
  const shown = useRef(view.config)
  const changed = changedSetup(shown.current, view.config)
  useEffect(() => {
    shown.current = view.config
  })
  return (
    <div class={styles.summary} data-testid={setupSummaryTestIds.summary}>
      {setupTiles(view.config).map((tile) => (
        <div
          key={`${tile.type}:${tile.value}`}
          class={styles.tile}
          data-changed={changed.has(tile.type) || undefined}
          data-testid={TILE_TEST_IDS[tile.type]}
        >
          <span class={styles.value} data-testid={setupSummaryTestIds.tileValue}>
            {tile.value}
          </span>
          <span class={styles.label}>{tile.label}</span>
        </div>
      ))}
      <div
        key={`questions:${describeMix(mix)}`}
        class={cx(styles.tile, styles.questions)}
        data-changed={changed.has(SetupTileType.QUESTIONS) || undefined}
        data-testid={setupSummaryTestIds.questions}
      >
        <span class={styles.label}>{describeMix(mix)}</span>
        <RoundStrip mix={mix} total={false} centred />
      </div>
      <div
        key={`map:${mapDetail}`}
        class={cx(styles.tile, styles.mapDetail)}
        data-changed={changed.has(SetupTileType.MAP_DETAIL) || undefined}
        data-testid={setupSummaryTestIds.mapDetail}
      >
        <MapDetailSummary value={mapDetail} />
      </div>
    </div>
  )
}
