import type { CommonsFile } from "@whereabouts/shared/ids"
import { commonsPageUrl } from "@whereabouts/shared/questions"
import { Icon } from "../../icons"
import styles from "./CommonsCredit.module.css"

export const CommonsCredit = ({ image }: { image: CommonsFile }) => {
  return (
    <a
      class={styles.credit}
      href={commonsPageUrl(image)}
      target="_blank"
      rel="noopener"
      title="Image from Wikimedia Commons"
      aria-label="Image credit: Wikimedia Commons"
      onClick={(event) => event.stopPropagation()}
    >
      <Icon name="info" size={14} />
    </a>
  )
}
