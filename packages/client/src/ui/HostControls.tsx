/**
 * Host-only controls that affect everyone. Ending the game is not undoable,
 * so the button opens a confirmation dialog first.
 */
import { Icon } from "./icons";
import { endGameRequest, useConfirm } from "./ConfirmDialog";
import { hostControlsTestIds } from "./HostControlsTestIds";

export function EndGameButton({ onEnd, title }: { onEnd: () => void; title?: string }) {
  const { dialog, ask } = useConfirm();
  return (
    <>
      <button
        class="end-game"
        data-testid={hostControlsTestIds.endGameButton}
        title={title ?? "Stop here and show the final standings"}
        onClick={() => ask(endGameRequest(onEnd))}
      >
        <Icon name="stop" /> End game
      </button>
      {dialog}
    </>
  );
}
