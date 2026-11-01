import { cx } from "../../../cx"
import { Icon } from "../../../icons"
import s from "./EnlargeBadge.module.css"

/** Says a picture opens up: always shown, so a phone (no hover) knows too. */
export function EnlargeBadge({ label }: { label?: boolean }) {
  return (
    <span class={cx(s.badge, label && s.withLabel)} aria-hidden="true">
      <Icon name="enlarge" size={14} />
      {label && <span>Enlarge</span>}
    </span>
  )
}
