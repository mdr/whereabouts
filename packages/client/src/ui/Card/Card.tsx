import type { ComponentChildren, HTMLAttributes } from "preact"
import { cx } from "../cx"
import styles from "./Card.module.css"

/** `as` a paragraph or a section where the card is one; anything else passes on to that element. */
export function Card({
  title,
  children,
  class: className,
  as: Tag = "div",
  ...rest
}: {
  title?: string
  children: ComponentChildren
  class?: string
  as?: "div" | "p" | "section"
} & Omit<HTMLAttributes<HTMLDivElement>, "title" | "class" | "as">) {
  // Typed as a div, the attributes the three share.
  const El = Tag as "div"
  return (
    <El class={cx(styles.card, className)} {...rest}>
      {title && <h2 class={styles.title}>{title}</h2>}
      {children}
    </El>
  )
}
