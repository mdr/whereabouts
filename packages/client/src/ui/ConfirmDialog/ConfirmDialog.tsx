/**
 * A modal "are you sure?" for actions that affect other players. Escape,
 * the backdrop and Cancel all dismiss it; the confirm button is styled as
 * destructive. `useConfirm` gives a screen one dialog and an `ask` function.
 */
import { useLayoutEffect, useState } from "preact/hooks"
import { useGameService } from "../../game-service/use-game-service"
import { useElementRef } from "../element-ref"
import { onDialogCancel, useModalDialog } from "../modal-dialog"
import type { ComponentChildren } from "preact"
import { createPortal } from "preact/compat"
import type { ConfirmRequest } from "./confirm-requests"
import { confirmDialogTestIds } from "./ConfirmDialogTestIds"
import styles from "./ConfirmDialog.module.css"

const ConfirmDialog = ({
  request,
  onClose,
  online = true
}: {
  request: ConfirmRequest | undefined
  onClose: () => void
  /** Offline, a confirmed action would be lost, so confirming waits. */
  online?: boolean
}) => {
  const cancelRef = useElementRef<HTMLButtonElement>()
  const dialogRef = useModalDialog(request !== undefined)
  // After the dialog opens, which focuses the dialog itself.
  useLayoutEffect(() => {
    if (request) cancelRef.current?.focus()
  }, [request])
  if (!request) return undefined
  // Rendered into <body>: a transformed ancestor (the bottom toolbar is one)
  // would otherwise become the box the fixed backdrop fills.
  return createPortal(
    <dialog
      ref={dialogRef}
      class={styles.backdrop}
      aria-labelledby="confirm-title"
      tabIndex={-1}
      data-testid={confirmDialogTestIds.backdrop}
      onCancel={onDialogCancel(onClose)}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div class={styles.modal} data-testid={confirmDialogTestIds.dialog}>
        <h2 id="confirm-title" data-testid={confirmDialogTestIds.title}>
          {request.title}
        </h2>
        <p>{request.body}</p>
        <div class={styles.actions}>
          <button ref={cancelRef} onClick={onClose} data-testid={confirmDialogTestIds.cancelButton}>
            Cancel
          </button>
          <button
            class={request.safe ? "primary" : "danger solid"}
            data-testid={confirmDialogTestIds.confirmButton}
            disabled={!online}
            onClick={() => {
              onClose()
              request.onConfirm()
            }}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </dialog>,
    document.body
  )
}

/** One dialog per screen: render `dialog`, call `ask` to open it. */
export const useConfirm = (): { dialog: ComponentChildren; ask: (request: ConfirmRequest) => void } => {
  const { online } = useGameService()
  const [request, setRequest] = useState<ConfirmRequest | undefined>(undefined)
  return {
    dialog: <ConfirmDialog request={request} onClose={() => setRequest(undefined)} online={online.value} />,
    ask: setRequest
  }
}
