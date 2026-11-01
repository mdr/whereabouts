import { wikipediaUrl } from "@whereabouts/shared/questions"
import type { WikiTitle } from "@whereabouts/shared/ids"
import { cx } from "../../../cx"
import { Icon } from "../../../icons"
import { answerTestIds } from "./AnswerTestIds"
import styles from "./Answer.module.css"

/** The revealed answer, with a link to read about it on Wikipedia. */
export const Answer = ({ label, wiki }: { label: string; wiki: WikiTitle }) => {
  return (
    <p class={cx(styles.answer, "kept-folded")} data-testid={answerTestIds.answer}>
      It's <b>{label}</b>{" "}
      <a class={styles.wikiLink} href={wikipediaUrl(wiki)} target="_blank" rel="noopener noreferrer">
        Wikipedia <Icon name="external" size={12} />
      </a>
    </p>
  )
}
