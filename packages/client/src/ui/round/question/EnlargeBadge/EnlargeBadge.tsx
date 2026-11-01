import { cx } from "../../../cx"
import { Icon } from "../../../icons"
import styles from "./EnlargeBadge.module.css"

/** Says a picture opens up: always shown, so a phone (no hover) knows too. */
export const EnlargeBadge = ({ label }: { label?: boolean }) => (
  <span class={cx(styles.badge, label && styles.withLabel)} aria-hidden="true">
    <Icon name="enlarge" size={14} />
    {label && <span>Enlarge</span>}
  </span>
)
