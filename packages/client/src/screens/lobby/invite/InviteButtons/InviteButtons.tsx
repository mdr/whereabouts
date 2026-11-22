import { useState } from "preact/hooks"
import { Icon } from "../../../../ui/icons"
import styles from "./InviteButtons.module.css"
import { ANALYTICS_CODES } from "@whereabouts/shared/telemetry/web-codes"
import { useTelemetry } from "../../../../telemetry/use-telemetry"

export const InviteButtons = ({ code }: { code: string }) => {
  const { analytics } = useTelemetry()
  const [copied, setCopied] = useState(false)
  const url = `${location.origin}${location.pathname}#/game/${code}`
  const canShare = typeof navigator.share === "function"
  return (
    <div class={styles.invite}>
      <button
        onClick={() => {
          analytics.track(ANALYTICS_CODES.invite.linkCopied, "copied the invite link")
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
            analytics.track(ANALYTICS_CODES.invite.shared, "opened the share sheet")
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
