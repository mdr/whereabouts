import type { GameView } from "@whereabouts/shared/protocol/views"
import { GameMode } from "../../../game-service/game-mode"
import { useGameService } from "../../../game-service/use-game-service"
import type { RevealModel } from "../../../round/round-model"
import { WAITING_FOR_OTHERS } from "../../../round/round-words"
import { Icon } from "../../../ui/icons"
import { TakeSeatButton } from "../../../ui/players/TakeSeat/TakeSeat"
import { revealTestIds } from "../Reveal/RevealTestIds"

/** Ready and Next round (the host's way on); alone in practice, just Next. */
export const RevealButtons = ({ view, model }: { view: GameView; model: RevealModel }) => {
  const game = useGameService()
  const practice = game.mode === GameMode.PRACTICE
  const iAmReady = model.ready?.done ?? false
  return (
    <>
      {practice ? undefined : !model.ready ? (
        <TakeSeatButton view={view} />
      ) : (
        <button
          class={iAmReady ? "" : "primary"}
          onClick={() => game.ready()}
          disabled={iAmReady || !game.online.value}
          data-testid={revealTestIds.readyButton}
        >
          <Icon name="check" /> {iAmReady ? WAITING_FOR_OTHERS : "Ready"}
        </button>
      )}
      {model.next && (
        <button
          class={practice || iAmReady || !model.ready ? "primary" : ""}
          onClick={() => game.next()}
          disabled={!game.online.value}
          title={practice ? undefined : "Go on without waiting"}
          data-testid={revealTestIds.nextButton}
        >
          <Icon name={model.last ? "flag" : "next"} /> {model.next.label}
        </button>
      )}
    </>
  )
}
