import { wikipediaUrl, type PartOf } from "@whereabouts/shared/questions"
import type { WikiTitle } from "@whereabouts/shared/ids"
import { cx } from "../../../cx"
import { Icon } from "../../../icons"
import { SmallFlag } from "../../../pictures/SmallFlag/SmallFlag"
import { answerTestIds } from "./AnswerTestIds"
import styles from "./Answer.module.css"

/** The revealed answer, with whose it is on a part of a country, and a link to read about it on Wikipedia. */
export const Answer = ({ label, wiki, partOf }: { label: string; wiki: WikiTitle; partOf?: PartOf | undefined }) => (
  <p class={cx(styles.answer, "kept-folded")} data-testid={answerTestIds.answer}>
    It's <b>{label}</b>
    {partOf && (
      <span data-testid={answerTestIds.partOf}>
        , {partOf.status}
        <SmallFlag code={partOf.flag} class={styles.flag} />
      </span>
    )}{" "}
    <a class={styles.wikiLink} href={wikipediaUrl(wiki)} target="_blank" rel="noopener noreferrer">
      Wikipedia <Icon name="external" size={12} />
    </a>
  </p>
)
