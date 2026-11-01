import type { FlagCode } from "@whereabouts/shared/ids"
import { cx } from "../../cx"
import { flagShape, useFlagUrl } from "../flag-url"
import styles from "./SmallFlag.module.css"

/** A small flag beside a country's name, which says the name: no alt text of its own. */
export const SmallFlag = ({ code, class: className }: { code: FlagCode; class?: string }) => {
  const src = useFlagUrl(code)
  return (
    <span class={cx(styles.smallFlag, className)} style={flagShape(code)}>
      {src && <img src={src} alt="" draggable={false} />}
    </span>
  )
}
