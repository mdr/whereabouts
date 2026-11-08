import type { Lookalikes } from "@whereabouts/shared/catalogue/lookalike-flags"
import { createPortal } from "preact/compat"
import { SmallFlag } from "../../../pictures/SmallFlag/SmallFlag"
import { onDialogCancel, useModalDialog } from "../../../modal-dialog"
import { cx } from "../../../cx"
import { flagLabel, lookalikesHeading } from "../../../../round/lookalike-words"
import { lookalikeCompareTestIds } from "./LookalikeCompareTestIds"
import styles from "./LookalikeCompare.module.css"

/** A flag round's look-alikes side by side, large enough to see what marks each apart. */
export const LookalikeCompare = ({ lookalikes, onClose }: { lookalikes: Lookalikes; onClose: () => void }) => {
  const dialogRef = useModalDialog()
  // Into <body>: the question card's transform would otherwise hold the backdrop inside it.
  return createPortal(
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- Backdrop click is a mouse shortcut; Escape (the dialog's cancel) is the keyboard's.
    <dialog
      ref={dialogRef}
      class={styles.backdrop}
      aria-labelledby="lookalike-compare-title"
      tabIndex={-1}
      data-testid={lookalikeCompareTestIds.dialog}
      onCancel={onDialogCancel(onClose)}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div class={styles.card}>
        <h2 id="lookalike-compare-title" class={styles.heading}>
          {lookalikesHeading(lookalikes)}
        </h2>
        <button class={styles.close} aria-label="Close" onClick={onClose} data-testid={lookalikeCompareTestIds.close}>
          ×
        </button>
        <ul class={styles.flags}>
          {lookalikes.flags.map(({ code, tip }, i) => (
            <li key={code} class={cx(styles.flag, i === 0 && styles.answer)} data-testid={lookalikeCompareTestIds.flag}>
              <SmallFlag code={code} class={styles.picture} />
              <span class={styles.name}>{flagLabel(code)}</span>
              <span class={styles.tip}>{tip}</span>
            </li>
          ))}
        </ul>
      </div>
    </dialog>,
    document.body
  )
}
