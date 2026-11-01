import type { ComponentChildren } from "preact"
import s from "./ToolLabel.module.css"

/** A tool button's text, which gives way to its icon where the toolbar is short of room. */
export function ToolLabel({ children }: { children: ComponentChildren }) {
  return <span class={s.label}>{children}</span>
}
