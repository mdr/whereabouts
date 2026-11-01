import { useState } from "preact/hooks"
import { Icon } from "../../../../ui/icons"
import styles from "./InviteButtons.module.css"

export const InviteButtons = ({ code }: { code: string }) => {
  const [copied, setCopied] = useState(false)
  const url = `${location.origin}${location.pathname}#/game/${code}`
  const canShare = typeof navigator.share === "function"
  return (
    <div class={styles.invite}>
      <button
        onClick={() => {
          // Missing outside a secure context (a LAN address over http), whatever the DOM types say.
          // oxlint-disable-next-line typescript/no-unnecessary-condition
          void navigator.clipboard?.writeText(url).then(() => setCopied(true))
        }}
      >
        <Icon name={copied ? "check" : "link"} /> {copied ? "Link copied" : "Copy link"}
      </button>
      {canShare && (
        <button
          onClick={() => {
            void navigator.share({ title: "Whereabouts", text: `Join my game: ${code}`, url }).catch(() => {
              // Closing the share sheet rejects too; there is nothing to report.
            })
          }}
        >
          <Icon name="share" /> Share
        </button>
      )}
    </div>
  )
}
