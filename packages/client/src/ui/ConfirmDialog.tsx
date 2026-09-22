/**
 * A modal "are you sure?" for actions that affect other players. Escape,
 * the backdrop and Cancel all dismiss it; the confirm button is styled as
 * destructive. `useConfirm` gives a screen one dialog and an `ask` function.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { createPortal } from "preact/compat";

export interface ConfirmRequest {
  title: string;
  body: ComponentChildren;
  confirmLabel: string;
  onConfirm: () => void;
}

export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!request) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request]);
  if (!request) return null;
  // Rendered into <body>: a transformed ancestor (the bottom toolbar is one)
  // would otherwise become the box the fixed backdrop fills.
  return createPortal(
    <div class="modal-backdrop" onClick={onClose}>
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title">{request.title}</h2>
        <p>{request.body}</p>
        <div class="modal-actions">
          <button ref={cancelRef} onClick={onClose}>
            Cancel
          </button>
          <button
            class="danger solid"
            onClick={() => {
              onClose();
              request.onConfirm();
            }}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** One dialog per screen: render `dialog`, call `ask` to open it. */
export function useConfirm(): { dialog: ComponentChildren; ask: (request: ConfirmRequest) => void } {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  return {
    dialog: <ConfirmDialog request={request} onClose={() => setRequest(null)} />,
    ask: setRequest,
  };
}

/** The wording for removing a player, shared by every list that offers it. */
export function kickRequest(name: string, onConfirm: () => void): ConfirmRequest {
  return {
    title: `Remove ${name} from the game?`,
    body: "They lose their score and paint, and can't take their seat back. They can rejoin with the code as a new player.",
    confirmLabel: `Remove ${name}`,
    onConfirm,
  };
}

export function endGameRequest(onConfirm: () => void): ConfirmRequest {
  return {
    title: "End the game now?",
    body: "This round is scored as it stands and everyone goes to the final standings.",
    confirmLabel: "End game",
    onConfirm,
  };
}
