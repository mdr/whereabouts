/**
 * Host-only controls that affect everyone. Ending the game is not undoable,
 * so the button asks for a second click within a few seconds.
 */
import { useEffect, useState } from "preact/hooks";
import { Icon } from "./icons";

const CONFIRM_MS = 4000;

export function EndGameButton({ onEnd, title }: { onEnd: () => void; title?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), CONFIRM_MS);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <button
      class={`end-game ${armed ? "danger" : ""}`}
      title={title ?? "Stop here and show the final standings"}
      aria-live="polite"
      onClick={() => {
        if (armed) {
          setArmed(false);
          onEnd();
        } else {
          setArmed(true);
        }
      }}
    >
      <Icon name="stop" /> {armed ? "Click again to end the game" : "End game"}
    </button>
  );
}
