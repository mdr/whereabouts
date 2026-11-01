import type { ComponentChildren } from "preact"
import s from "./LobbyPanel.module.css"

/** One of the lobby's two panels. */
export function LobbyPanel({ children }: { children: ComponentChildren }) {
  return <section class={s.panel}>{children}</section>
}
