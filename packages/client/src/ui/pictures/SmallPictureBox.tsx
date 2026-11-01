import type { ComponentChildren } from "preact"
import { cx } from "../cx"
import s from "./SmallPicture.module.css"

/** A photo the size of a list row; click it to enlarge. */
export function SmallPictureBox({
  class: cls,
  style,
  children
}: {
  class?: string
  style?: Record<string, string>
  children?: ComponentChildren
}) {
  return (
    <span class={cx(s.smallPicture, cls)} style={style}>
      {children}
    </span>
  )
}
