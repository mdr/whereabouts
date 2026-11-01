import type { ComponentChildren } from "preact"
import styles from "./LobbyPanel.module.css"

/** One of the lobby's two panels. */
export function LobbyPanel({ children }: { children: ComponentChildren }) {
  return <section class={styles.panel}>{children}</section>
}
