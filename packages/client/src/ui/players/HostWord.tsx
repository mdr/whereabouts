import { Icon } from "../icons"
import styles from "./Players.module.css"

/** "the host" in running text, with the crown. */
export function HostWord({ capital }: { capital?: boolean }) {
  return (
    <span class={styles.hostWord}>
      <Icon name="crown" size={12} />
      {capital ? "The host" : "the host"}
    </span>
  )
}
