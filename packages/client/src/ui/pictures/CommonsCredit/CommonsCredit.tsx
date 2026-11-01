import type { CommonsFile } from "@whereabouts/shared/ids"
import { commonsPageUrl } from "@whereabouts/shared/questions"
import { Icon } from "../../icons"
import s from "./CommonsCredit.module.css"

export function CommonsCredit({ image }: { image: CommonsFile }) {
  return (
    <a
      class={s.credit}
      href={commonsPageUrl(image)}
      target="_blank"
      rel="noopener"
      title="Image from Wikimedia Commons"
      aria-label="Image credit: Wikimedia Commons"
      onClick={(e) => e.stopPropagation()}
    >
      <Icon name="info" size={14} />
    </a>
  )
}
