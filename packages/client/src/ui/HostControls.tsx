/**
 * Host-only controls that affect everyone. Ending the game is not undoable,
 * so the button opens a confirmation dialog first.
 */
import { Icon } from "./icons"
import { endGameRequest, useConfirm } from "./ConfirmDialog"
import { hostControlsTestIds } from "./HostControlsTestIds"
import { cx } from "./cx"
import s from "./HostControls.module.css"

/** `besidePlayers`: in the HUD with the players pill, which it sits beside on a phone. */
export function EndGameButton({
  onEnd,
  title,
  besidePlayers
}: {
  onEnd: () => void
  title?: string
  besidePlayers?: boolean
}) {
  const { dialog, ask } = useConfirm()
  return (
    <>
      <button
        class={cx(s.endGame, besidePlayers && s.besidePlayers)}
        data-testid={hostControlsTestIds.endGameButton}
        title={title ?? "Stop here and show the final standings"}
        onClick={() => ask(endGameRequest(onEnd))}
      >
        <Icon name="stop" /> End game
      </button>
      {dialog}
    </>
  )
}
