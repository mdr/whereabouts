import { useState } from "preact/hooks"
import type { RoomCode } from "@whereabouts/shared/ids"
import { DEV_PLAYERS_PATH, DevPlayersAction } from "@whereabouts/shared/protocol/dev-players"
import { Phase } from "@whereabouts/shared/protocol/views"
import { Card } from "../../Card/Card"
import { cx } from "../../cx"
import kit from "../../kit.module.css"
import { extraPlayersDevTestIds } from "./ExtraPlayersDevTestIds"
import styles from "./ExtraPlayersDev.module.css"

/** Players with no browser behind them, so a full room can be looked at by hand. Needs a development server. */
export const ExtraPlayersDev = ({ code, phase }: { code: RoomCode; phase: Phase }) => {
  const [error, setError] = useState<string | undefined>(undefined)
  const send = async (action: DevPlayersAction): Promise<void> => {
    setError(undefined)
    try {
      const response = await fetch(DEV_PLAYERS_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, action })
      })
      if (!response.ok) setError(`Not available here (${response.status}). Run pnpm dev.`)
    } catch {
      setError("The server did not answer.")
    }
  }
  return (
    <Card title="Extra players">
      <div class={styles.buttons}>
        <button
          disabled={phase !== Phase.LOBBY}
          onClick={() => void send(DevPlayersAction.SEAT)}
          data-testid={extraPlayersDevTestIds.addButton}
        >
          Add 16 players
        </button>
        <button
          disabled={phase !== Phase.GUESSING}
          onClick={() => void send(DevPlayersAction.PAINT)}
          data-testid={extraPlayersDevTestIds.paintButton}
        >
          Extra players paint
        </button>
      </div>
      {error && (
        <p class={cx(kit.hint, kit.warn)} data-testid={extraPlayersDevTestIds.error}>
          {error}
        </p>
      )}
    </Card>
  )
}
